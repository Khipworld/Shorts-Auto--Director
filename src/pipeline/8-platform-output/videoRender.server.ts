// 실제 mp4 렌더링 — K-Street의 video-render.server.ts를 이 프로젝트에 맞게 단순화해서 재작성.
// K-Street는 시대별 여러 장면 이미지를 크로스페이드로 이어붙이지만, 이 프로젝트의 쇼츠는
// 하나의 주제를 다루므로 배경 이미지 1장 + 타이밍이 실제 TTS 길이로 재계산된 자막 번인 +
// 나레이션 오디오로 단순화함(사용자 지시: "FFmpeg든 다른 방식이든 실제 영상으로 구현").
//
// TTS는 K-Street의 로컬 Coqui XTTS-v2 서비스(포트 5005)를 그대로 재사용(사용자가 "잠시 사용"
// 하기로 결정 — CPML 비영리 전용 라이선스라 실사용 배포 전 재검토 필요, PLAN.md 참고).
import type { Express, Request, Response as ExpressResponse } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
// @ts-ignore - ffmpeg-static ships its own .d.ts but as a default export of a path string
import ffmpegPath from "ffmpeg-static";
import { pickBackgroundImageDataUrl } from "./backgroundImage.server";
import type { SubtitleLine } from "../7-subtitles-media/subtitleSplit.server";

const OUTPUT_DIR = path.join(process.cwd(), "rendered-output");
const TMP_ROOT = path.join(OUTPUT_DIR, "tmp");
const TTS_BASE_URL = "http://127.0.0.1:5005";
const FONT_PATH = "C:/Windows/Fonts/malgun.ttf";
const LINE_GAP_SECONDS = 0.3;
const RESOLUTIONS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
};

export interface RenderVideoRequest {
  title: string;
  groupLabel: string;
  subtitles: SubtitleLine[]; // .text만 사용 — 타이밍은 실제 TTS 길이로 새로 계산함
  aspectRatio: "9:16" | "16:9";
  voicePreset?: string;
}

type JobStatus = "queued" | "picking_image" | "synthesizing_audio" | "rendering" | "done" | "error";
interface RenderJob {
  id: string;
  status: JobStatus;
  progress: number;
  downloadUrl?: string;
  error?: string;
  createdAt: number;
  totalDurationSeconds?: number;
}
const jobs = new Map<string, RenderJob>();

function ensureDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
}
function updateJob(jobId: string, patch: Partial<RenderJob>) {
  const job = jobs.get(jobId);
  if (job) Object.assign(job, patch);
}
function toFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}
// 실제 렌더링해보니 긴 자막 한 줄이 화면 폭(1080px)보다 넓어져서 좌우로 잘리는 문제를
// 발견함 — drawtext는 자동 줄바꿈을 안 해주므로 폰트 크기 기준으로 대략적인 최대 글자수를
// 계산해 직접 줄바꿈한다(한글은 대체로 정사각형 폭이라 fontsize를 글자당 폭으로 근사).
function wrapForDisplay(text: string, fontsize: number, maxWidthPx: number): string {
  const maxCharsPerLine = Math.max(6, Math.floor(maxWidthPx / fontsize));
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function dataUriToFile(dataUri: string, destPathNoExt: string): string {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(dataUri.trim());
  if (!match) throw new Error("이미지가 올바른 data URI 형식이 아닙니다.");
  const mime = match[1];
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const destPath = `${destPathNoExt}.${ext}`;
  fs.writeFileSync(destPath, Buffer.from(match[2], "base64"));
  return destPath;
}

async function synthesizeLine(text: string, voicePreset: string): Promise<{ audioPath: string; durationSeconds: number }> {
  const res = await fetch(`${TTS_BASE_URL}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voicePreset, speed: 1.0 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TTS 합성 실패 (HTTP ${res.status}): ${body}. tts-service(포트 5005)가 실행 중인지 확인하세요.`);
  }
  const data = await res.json();
  if (!data?.audioPath || typeof data?.durationSeconds !== "number") {
    throw new Error("TTS 서버가 예상과 다른 응답을 반환했습니다.");
  }
  return { audioPath: data.audioPath, durationSeconds: data.durationSeconds };
}

interface TimedLine {
  text: string;
  wavPath: string;
  start: number;
  end: number;
}

async function runRenderJob(jobId: string, body: RenderVideoRequest) {
  ensureDirs();
  const jobDir = path.join(TMP_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const subsDir = path.join(jobDir, "subs");
  fs.mkdirSync(subsDir, { recursive: true });

  try {
    const voicePreset = body.voicePreset || "news-anchor";
    const res = RESOLUTIONS[body.aspectRatio] || RESOLUTIONS["9:16"];

    updateJob(jobId, { status: "picking_image", progress: 5 });
    const backgroundDataUrl = await pickBackgroundImageDataUrl(body.groupLabel, body.title);
    const imagePath = dataUriToFile(backgroundDataUrl, path.join(jobDir, "background"));

    updateJob(jobId, { status: "synthesizing_audio", progress: 15 });
    const lines = body.subtitles.map((s) => s.text.trim()).filter(Boolean);
    const timedLines: TimedLine[] = [];
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      const { audioPath, durationSeconds } = await synthesizeLine(lines[i], voicePreset);
      const destWav = path.join(jobDir, `line_${String(i).padStart(3, "0")}.wav`);
      fs.copyFileSync(audioPath, destWav);
      const start = cursor;
      const end = start + durationSeconds;
      timedLines.push({ text: lines[i], wavPath: destWav, start, end });
      cursor = end + LINE_GAP_SECONDS;
      updateJob(jobId, { progress: Math.round(15 + ((i + 1) / Math.max(1, lines.length)) * 40) });
    }
    const totalDuration = Math.max(cursor, 1);

    updateJob(jobId, { status: "rendering", progress: 55, totalDurationSeconds: totalDuration });

    const fontsize = body.aspectRatio === "9:16" ? 54 : 42;
    const maxTextWidthPx = res.w - 120; // 좌우 여백 60px씩
    timedLines.forEach((line, idx) => {
      fs.writeFileSync(path.join(subsDir, `line_${idx}.txt`), wrapForDisplay(line.text, fontsize, maxTextWidthPx), { encoding: "utf8" });
    });

    const filterLines: string[] = [];
    filterLines.push(
      `[0:v]scale=${res.w}:${res.h}:force_original_aspect_ratio=increase,crop=${res.w}:${res.h},setsar=1,fps=30,format=yuv420p[vimg]`
    );

    let videoLabel = "vimg";
    const fontFilterPath = toFilterPath(FONT_PATH);
    const baseY = body.aspectRatio === "9:16" ? "h-260" : "h-160";
    timedLines.forEach((line, idx) => {
      const textFilePath = toFilterPath(path.join(subsDir, `line_${idx}.txt`));
      const nextLabel = `vsub${idx}`;
      filterLines.push(
        `[${videoLabel}]drawtext=fontfile='${fontFilterPath}':textfile='${textFilePath}':fontsize=${fontsize}:line_spacing=8:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${baseY}:enable='between(t,${line.start.toFixed(3)},${line.end.toFixed(3)})'[${nextLabel}]`
      );
      videoLabel = nextLabel;
    });
    filterLines.push(`[${videoLabel}]copy[vout]`);

    const ffArgs: string[] = ["-y", "-loop", "1", "-t", totalDuration.toFixed(3), "-framerate", "30", "-i", imagePath];
    timedLines.forEach((line) => ffArgs.push("-i", line.wavPath));

    const audioMixLabels: string[] = [];
    timedLines.forEach((line, idx) => {
      const inputIdx = 1 + idx;
      const ms = Math.max(0, Math.round(line.start * 1000));
      const lbl = `aline${idx}`;
      filterLines.push(`[${inputIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}:all=1[${lbl}]`);
      audioMixLabels.push(lbl);
    });
    if (audioMixLabels.length > 0) {
      const mixIn = audioMixLabels.map((l) => `[${l}]`).join("");
      filterLines.push(
        `${mixIn}amix=inputs=${audioMixLabels.length}:duration=longest:normalize=0,atrim=0:${totalDuration.toFixed(3)},apad=whole_dur=${totalDuration.toFixed(3)}[aout]`
      );
    } else {
      filterLines.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${totalDuration.toFixed(3)}[aout]`);
    }

    const filterScriptPath = path.join(jobDir, "filter.txt");
    fs.writeFileSync(filterScriptPath, filterLines.join(";\n"), { encoding: "utf8" });

    const finalMp4Path = path.join(jobDir, "output.mp4");
    ffArgs.push(
      "-filter_complex_script", filterScriptPath,
      "-map", "[vout]", "-map", "[aout]",
      "-t", totalDuration.toFixed(3),
      "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-nostats",
      finalMp4Path
    );

    await runFfmpeg(ffArgs, (fraction) => {
      updateJob(jobId, { progress: Math.min(95, 55 + Math.round(Math.max(0, Math.min(1, fraction)) * 40)) });
    });

    const destPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    fs.copyFileSync(finalMp4Path, destPath);
    updateJob(jobId, { status: "done", progress: 100, downloadUrl: `/api/video/download/${jobId}` });
    fs.rm(jobDir, { recursive: true, force: true }, () => {});
  } catch (err: any) {
    console.error(`[video-render] job ${jobId} failed:`, err);
    updateJob(jobId, { status: "error", error: err?.message || String(err) });
  }
}

function runFfmpeg(args: string[], onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = (ffmpegPath as unknown as string) || "ffmpeg";
    const proc = spawn(bin, args, { windowsHide: true });
    let stderrTail = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const match = /out_time_ms=(\d+)/.exec(text);
      if (match) onProgress(Number(match[1]) / 1_000_000 / 30);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrTail += chunk.toString("utf8");
      if (stderrTail.length > 8000) stderrTail = stderrTail.slice(-8000);
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 종료 코드 ${code}\n${stderrTail.slice(-2000)}`));
    });
  });
}

export function registerVideoRenderRoutes(app: Express) {
  ensureDirs();

  app.post("/api/video/render", (req: Request, res: ExpressResponse) => {
    const body = req.body as RenderVideoRequest;
    if (!body?.title || !Array.isArray(body?.subtitles) || !body.subtitles.length) {
      return res.status(400).json({ error: "title, subtitles가 필요합니다." });
    }
    const jobId = crypto.randomUUID();
    jobs.set(jobId, { id: jobId, status: "queued", progress: 0, createdAt: Date.now() });
    res.json({ jobId });
    runRenderJob(jobId, body);
  });

  app.get("/api/video/render/:jobId/status", (req: Request, res: ExpressResponse) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "존재하지 않는 작업입니다." });
    return res.json({ status: job.status, progress: job.progress, downloadUrl: job.downloadUrl, error: job.error, totalDurationSeconds: job.totalDurationSeconds });
  });

  app.get("/api/video/download/:jobId", (req: Request, res: ExpressResponse) => {
    const job = jobs.get(req.params.jobId);
    if (!job || job.status !== "done") return res.status(404).json({ error: "아직 완성되지 않았거나 존재하지 않는 작업입니다." });
    const filePath = path.join(OUTPUT_DIR, `${req.params.jobId}.mp4`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "렌더링 파일을 찾을 수 없습니다." });
    res.setHeader("Content-Type", "video/mp4");
    return res.sendFile(filePath);
  });
}
