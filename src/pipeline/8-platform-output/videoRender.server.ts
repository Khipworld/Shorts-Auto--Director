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
import { renderSlidesToPng, SlideSpec, SlideTheme, SlideLayout } from "./slideRenderer.server";
import { renderIntroClip, prependIntro } from "./introAnimator.server";
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

// 화면(StudioScreen)의 자막 위치 슬라이더 값. 스튜디오 미리보기와 실제 영상이 어긋나지
// 않도록, 미리보기가 쓰는 계산식과 똑같은 방식으로 좌표를 구한다.
export interface SubtitleLayoutRequest {
  vertical: number; // 0~100 — 자막 상자의 세로 중심 위치 (50이 화면 정중앙)
  horizontal: number; // 0~100 — 남는 폭 안에서의 좌우 위치 (50이 가운데)
  margin: number; // 2~20 — 좌우 여백 비율(%). 자막 상자 폭 = 100 - margin*2
}

export interface RenderVideoRequest {
  title: string;
  groupLabel: string;
  subtitles: SubtitleLine[]; // .text만 사용 — 타이밍은 실제 TTS 길이로 새로 계산함
  aspectRatio: "9:16" | "16:9";
  voicePreset?: string;
  subtitleLayout?: SubtitleLayoutRequest; // 없으면 기존 동작(하단 고정) 그대로

  // 카드뉴스 방식(참고 영상 `01_임신부_후킹결합.mp4`와 같은 구성)으로 만들 때 쓴다.
  // 넘기면 슬라이드 이미지를 그려 장면별로 이어 붙이고, 화면 글씨는 카드 자체가 담당하므로
  // 별도 자막 번인을 하지 않는다. 안 넘기면 기존 방식(AI 배경 1장 + 자막 번인) 그대로.
  slides?: SlideSpec[];
  slideTheme?: SlideTheme;
  bannerText?: string;

  // 나레이션 말하기 속도(0.8~1.8). 기본 1.0은 기존 동작 그대로.
  // 실측: 로컬 XTTS가 한국어를 느리게 읽어서 같은 내용이 참고 영상(19.9초)의 2배가 넘는
  // 54초로 나왔음 — 속도를 올려 최적 길이(20~35초)에 맞추기 위한 조절값.
  speechSpeed?: number;

  // 카드의 설명(핵심 수치)까지 성우가 읽을지. 기본은 읽지 않음(제목만) — 영상이 길어지는
  // 가장 큰 원인이고, 설명은 어차피 화면에 글씨로 남기 때문.
  readCardDetail?: boolean;

  // 배경음악 / 전환 효과음. 프리셋 id("epic-doc" 등)이거나 "none"/미지정이면 안 넣는다.
  // 볼륨은 0~100. 음원은 public/audio 아래에 있다(K-Street에서 가져옴, 상업 사용 가능).
  bgmTrack?: string;
  bgmVolume?: number;
  sfxTrack?: string;
  sfxVolume?: number;

  // 맨 앞에 붙일 동적 도입부(금색 티켓이 날아오는 3초). 참고 영상 01_임신부편에만 있던
  // 연출을 프로그램에서 자동으로 만들어 붙인다. false거나 미지정이면 안 붙임.
  withIntro?: boolean;
}

// 프리셋 id → 실제 음원 파일 경로. 목록에 없는 값이나 "none"이면 null(= 안 넣음).
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const BGM_FILES: Record<string, string> = {
  "epic-doc": "epic-doc.mp3",
  "emotional-piano": "emotional-piano.mp3",
  "shorts-synth": "shorts-synth.mp3",
  "future-ambient": "future-ambient.mp3",
};
const SFX_FILES: Record<string, string> = {
  "epic-doc": "epic-doc-transition.wav",
  "emotional-piano": "emotional-piano-transition.wav",
  "shorts-synth": "shorts-synth-transition.wav",
  "future-ambient": "future-ambient-transition.wav",
};

function resolveAudioPath(dir: string, table: Record<string, string>, key?: string): string | null {
  if (!key || key === "none") return null;
  const file = table[key];
  if (!file) return null;
  const full = path.join(AUDIO_DIR, dir, file);
  return fs.existsSync(full) ? full : null;
}
function resolveBgmPath(key?: string): string | null {
  return resolveAudioPath("bgm", BGM_FILES, key);
}
function resolveSfxPath(key?: string): string | null {
  return resolveAudioPath("sfx", SFX_FILES, key);
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

// 영상마다 제목·길이 같은 정보를 mp4 옆에 작은 json으로 남긴다.
// 그래야 나중에 목록에서 "무슨 영상인지" 알아볼 수 있다(파일명은 임의의 id라 알 수 없음).
export interface VideoMeta {
  title: string;
  groupLabel: string;
  durationSeconds: number;
  createdAt: string;
}
function metaPath(id: string): string {
  return path.join(OUTPUT_DIR, `${id}.json`);
}
function writeVideoMeta(id: string, meta: VideoMeta) {
  try {
    fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), { encoding: "utf8" });
  } catch {
    /* 정보 파일은 없어도 목록은 뜨므로 실패해도 무시 */
  }
}
function readVideoMeta(id: string): VideoMeta | null {
  try {
    const p = metaPath(id);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
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
// 자막 위치 슬라이더 값을 ffmpeg drawtext의 x/y 식과 줄바꿈 폭으로 바꾼다.
//
// 미리보기(StudioScreen의 SlidePreview)와 계산식을 일부러 똑같이 맞췄다:
//   자막 상자 폭 = 100 - margin*2 (%)
//   좌우로 움직일 수 있는 여지 = 100 - 상자폭 = margin*2 (%)
//   상자 왼쪽 위치 = 여지 * (horizontal/100)
// 이렇게 하면 좌우 슬라이더를 끝까지 밀어도 상자가 화면 밖으로 나가지 않는다.
//
// drawtext의 x/y는 글자 블록의 좌상단이므로, 상자 안에서 가운데 정렬(x)하고
// 세로는 중심이 vertical% 에 오도록(y) 계산한다. 글자가 길거나 커서 화면을 벗어나는
// 경우를 대비해 max()/min()으로 화면 안에 묶어 둔다.
const EDGE_GUARD_PX = 16;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function resolveSubtitlePlacement(
  layout: SubtitleLayoutRequest | undefined,
  res: { w: number; h: number },
  aspectRatio: string
): { xExpr: string; yExpr: string; wrapWidthPx: number } {
  if (!layout) {
    // 예전 요청(슬라이더 값이 없는 경우)은 기존 동작 그대로 — 가운데 정렬 + 하단 고정.
    return {
      xExpr: "(w-text_w)/2",
      yExpr: aspectRatio === "9:16" ? "h-260" : "h-160",
      wrapWidthPx: res.w - 120,
    };
  }

  const vertical = clampNumber(layout.vertical, 0, 100, 58);
  const horizontal = clampNumber(layout.horizontal, 0, 100, 50);
  const margin = clampNumber(layout.margin, 0, 40, 8);

  const boxWidthPx = Math.round((res.w * (100 - margin * 2)) / 100);
  const travelPx = res.w - boxWidthPx;
  const leftPx = Math.round(travelPx * (horizontal / 100));
  const centerYPx = Math.round((res.h * vertical) / 100);

  const maxX = res.w - EDGE_GUARD_PX;
  const maxY = res.h - EDGE_GUARD_PX;

  return {
    xExpr: `max(${EDGE_GUARD_PX}\\,min(${maxX}-text_w\\,${leftPx}+(${boxWidthPx}-text_w)/2))`,
    yExpr: `max(${EDGE_GUARD_PX}\\,min(${maxY}-text_h\\,${centerYPx}-text_h/2))`,
    wrapWidthPx: Math.max(120, boxWidthPx),
  };
}

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

async function synthesizeLine(text: string, voicePreset: string, speed: number): Promise<{ audioPath: string; durationSeconds: number }> {
  const res = await fetch(`${TTS_BASE_URL}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voicePreset, speed }),
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

// 슬라이드 한 장에서 성우가 읽을 문장.
//
// 카드는 제목만 읽고 설명(핵심 수치)은 화면 글씨로만 보여준다 — 카드뉴스의 기본 방식이고,
// 참고 영상(01_임신부_후킹결합.mp4)도 카드 구간이 카드당 2.7초 정도라 전체를 읽지 않는다.
// 실측: 제목+설명을 다 읽으면 속도 1.8배로 올려도 31초, 제목만 읽으면 1.4배에서 27초로
// 최적 길이(20~35초) 안에 들어온다. 설명은 화면에 그대로 남으므로 정보가 사라지지는 않는다.
// (readDetail을 켜면 예전처럼 설명까지 읽는다.)
function narrationForSlide(slide: SlideSpec, readDetail: boolean): string {
  if (slide.kind === "card") {
    return readDetail ? [slide.title, slide.detail].filter(Boolean).join(". ") : slide.title;
  }
  return slide.headline;
}

async function runRenderJob(jobId: string, body: RenderVideoRequest) {
  ensureDirs();
  const jobDir = path.join(TMP_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const subsDir = path.join(jobDir, "subs");
  fs.mkdirSync(subsDir, { recursive: true });

  try {
    const voicePreset = body.voicePreset || "news-anchor";
    const speechSpeed = clampNumber(body.speechSpeed, 0.8, 1.8, 1.0);
    const res = RESOLUTIONS[body.aspectRatio] || RESOLUTIONS["9:16"];
    const ffBin = (ffmpegPath as unknown as string) || "ffmpeg";

    // 카드뉴스 방식이면 슬라이드 이미지를 그리고, 아니면 예전처럼 AI 배경 1장을 쓴다.
    const useSlides = Array.isArray(body.slides) && body.slides.length > 0;
    let slideImagePaths: string[] = [];
    let imagePath = "";

    updateJob(jobId, { status: "picking_image", progress: 5 });
    if (useSlides) {
      const theme: SlideTheme = body.slideTheme ?? { gradientFrom: "#1565c0", gradientTo: "#bbdefb", accent: "#1565c0" };
      const layout: SlideLayout | undefined = body.subtitleLayout
        ? { vertical: body.subtitleLayout.vertical, horizontal: body.subtitleLayout.horizontal, margin: body.subtitleLayout.margin }
        : undefined;
      slideImagePaths = renderSlidesToPng(
        body.slides!,
        body.bannerText || `${body.groupLabel} 지원정책 안내`,
        theme,
        path.join(jobDir, "slides"),
        ffBin,
        layout
      );
    } else {
      const backgroundDataUrl = await pickBackgroundImageDataUrl(body.groupLabel, body.title);
      imagePath = dataUriToFile(backgroundDataUrl, path.join(jobDir, "background"));
    }

    updateJob(jobId, { status: "synthesizing_audio", progress: 15 });
    // 카드뉴스일 땐 슬라이드마다 읽을 문장이 하나씩 — 슬라이드 수와 나레이션 줄 수가 일치해야
    // 장면과 음성이 어긋나지 않는다.
    const lines = useSlides
      ? body.slides!.map((s) => narrationForSlide(s, body.readCardDetail === true)).map((t) => t.trim()).filter(Boolean)
      : body.subtitles.map((s) => s.text.trim()).filter(Boolean);
    const timedLines: TimedLine[] = [];
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      const { audioPath, durationSeconds } = await synthesizeLine(lines[i], voicePreset, speechSpeed);
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

    const filterLines: string[] = [];
    const ffArgs: string[] = ["-y"];
    let videoInputCount = 0;

    if (useSlides) {
      // 슬라이드마다 자기 나레이션이 끝날 때까지 화면에 머문다(마지막 장은 끝까지).
      // 장면 전환이 곧 카드 넘김이라, 참고 영상처럼 카드가 순서대로 넘어간다.
      slideImagePaths.forEach((p, idx) => {
        const line = timedLines[idx];
        const nextStart = idx + 1 < timedLines.length ? timedLines[idx + 1].start : totalDuration;
        const dur = Math.max(0.4, (line ? nextStart - line.start : totalDuration));
        ffArgs.push("-loop", "1", "-t", dur.toFixed(3), "-framerate", "30", "-i", p);
        filterLines.push(`[${idx}:v]scale=${res.w}:${res.h},setsar=1,fps=30,format=yuv420p[vs${idx}]`);
        videoInputCount++;
      });
      const concatIn = slideImagePaths.map((_, i) => `[vs${i}]`).join("");
      filterLines.push(`${concatIn}concat=n=${slideImagePaths.length}:v=1:a=0[vout]`);
    } else {
      const fontsize = body.aspectRatio === "9:16" ? 54 : 42;
      const placement = resolveSubtitlePlacement(body.subtitleLayout, res, body.aspectRatio);
      timedLines.forEach((line, idx) => {
        fs.writeFileSync(path.join(subsDir, `line_${idx}.txt`), wrapForDisplay(line.text, fontsize, placement.wrapWidthPx), { encoding: "utf8" });
      });

      ffArgs.push("-loop", "1", "-t", totalDuration.toFixed(3), "-framerate", "30", "-i", imagePath);
      videoInputCount = 1;
      filterLines.push(
        `[0:v]scale=${res.w}:${res.h}:force_original_aspect_ratio=increase,crop=${res.w}:${res.h},setsar=1,fps=30,format=yuv420p[vimg]`
      );

      let videoLabel = "vimg";
      const fontFilterPath = toFilterPath(FONT_PATH);
      timedLines.forEach((line, idx) => {
        const textFilePath = toFilterPath(path.join(subsDir, `line_${idx}.txt`));
        const nextLabel = `vsub${idx}`;
        filterLines.push(
          `[${videoLabel}]drawtext=fontfile='${fontFilterPath}':textfile='${textFilePath}':fontsize=${fontsize}:line_spacing=8:fontcolor=white:borderw=3:bordercolor=black:x=${placement.xExpr}:y=${placement.yExpr}:enable='between(t,${line.start.toFixed(3)},${line.end.toFixed(3)})'[${nextLabel}]`
        );
        videoLabel = nextLabel;
      });
      filterLines.push(`[${videoLabel}]copy[vout]`);
    }

    timedLines.forEach((line) => ffArgs.push("-i", line.wavPath));

    const audioMixLabels: string[] = [];
    timedLines.forEach((line, idx) => {
      const inputIdx = videoInputCount + idx;
      const ms = Math.max(0, Math.round(line.start * 1000));
      const lbl = `aline${idx}`;
      filterLines.push(`[${inputIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}:all=1[${lbl}]`);
      audioMixLabels.push(lbl);
    });

    // ── 배경음악 ──
    // 나레이션보다 훨씬 작게 깔고, 곡이 영상보다 짧으면 반복하고 길면 잘라낸다.
    // 끝에서 1.2초 페이드아웃해서 뚝 끊기지 않게 한다.
    let nextInputIdx = videoInputCount + timedLines.length;
    const bgmPath = resolveBgmPath(body.bgmTrack);
    if (bgmPath) {
      ffArgs.push("-stream_loop", "-1", "-i", bgmPath);
      const vol = clampNumber(body.bgmVolume, 0, 100, 35) / 100;
      const fadeStart = Math.max(0, totalDuration - 1.2);
      filterLines.push(
        `[${nextInputIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${totalDuration.toFixed(3)},asetpts=N/SR/TB,volume=${vol.toFixed(3)},afade=t=out:st=${fadeStart.toFixed(3)}:d=1.2[abgm]`
      );
      audioMixLabels.push("abgm");
      nextInputIdx++;
    }

    // ── 전환 효과음 ──
    // 장면(슬라이드)이 바뀌는 시점마다 한 번씩. 첫 장면은 시작하자마자라 넣지 않는다.
    const sfxPath = resolveSfxPath(body.sfxTrack);
    if (sfxPath && timedLines.length > 1) {
      const sfxVol = clampNumber(body.sfxVolume, 0, 100, 45) / 100;
      timedLines.slice(1).forEach((line, i) => {
        ffArgs.push("-i", sfxPath);
        const ms = Math.max(0, Math.round(line.start * 1000) - 150); // 장면 전환 살짝 앞서 울리게
        const lbl = `asfx${i}`;
        filterLines.push(
          `[${nextInputIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${sfxVol.toFixed(3)},adelay=${ms}:all=1[${lbl}]`
        );
        audioMixLabels.push(lbl);
        nextInputIdx++;
      });
    }

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

    // 동적 도입부를 앞에 붙인다. 본편은 이미 완성됐으므로, 도입부만 따로 만들어
    // 이어 붙이는 방식(본편 내용은 그대로).
    let deliverPath = finalMp4Path;
    if (body.withIntro && useSlides) {
      const first = body.slides![0];
      const headline = first.kind === "card" ? first.title : first.headline;
      const badge = first.kind === "card" ? body.groupLabel : first.badge;
      const theme = body.slideTheme ?? { gradientFrom: "#1565c0", gradientTo: "#bbdefb", accent: "#1565c0" };
      try {
        updateJob(jobId, { status: "rendering", progress: 96 });
        const introPath = renderIntroClip(
          {
            gradientTop: theme.gradientFrom,
            gradientBottom: theme.gradientTo,
            bannerText: body.bannerText || `${body.groupLabel} 지원정책 안내`,
            badge,
            headline,
          },
          path.join(jobDir, "intro"),
          ffBin
        );
        const withIntroPath = path.join(jobDir, "with_intro.mp4");
        prependIntro(introPath, finalMp4Path, withIntroPath, ffBin);
        deliverPath = withIntroPath;
      } catch (e: any) {
        // 도입부는 덤이라 실패해도 본편은 그대로 내보낸다.
        console.error(`[video-render] job ${jobId} 도입부 생성 실패(본편은 정상):`, e?.message || e);
      }
    }

    const destPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    fs.copyFileSync(deliverPath, destPath);
    writeVideoMeta(jobId, {
      title: body.title,
      groupLabel: body.groupLabel,
      durationSeconds: Math.round(totalDuration * 10) / 10,
      createdAt: new Date().toISOString(),
    });
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
    // 카드뉴스 방식이면 slides가, 기존 방식이면 subtitles가 있어야 한다.
    const hasSlides = Array.isArray(body?.slides) && body.slides.length > 0;
    const hasSubtitles = Array.isArray(body?.subtitles) && body.subtitles.length > 0;
    if (!body?.title || (!hasSlides && !hasSubtitles)) {
      return res.status(400).json({ error: "title과 함께 slides 또는 subtitles가 필요합니다." });
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

  // 파일이 있으면 바로 내려준다. 예전에는 서버 메모리의 작업 목록에 있어야만 받을 수
  // 있어서, 서버를 재시작하면 이미 만든 영상도 못 받는 문제가 있었다.
  app.get("/api/video/download/:jobId", (req: Request, res: ExpressResponse) => {
    const id = path.basename(req.params.jobId).replace(/\.mp4$/i, "");
    const filePath = path.join(OUTPUT_DIR, `${id}.mp4`);
    if (!fs.existsSync(filePath)) {
      const job = jobs.get(id);
      const msg = job && job.status !== "done" ? "아직 만드는 중입니다." : "영상 파일을 찾을 수 없습니다.";
      return res.status(404).json({ error: msg });
    }
    res.setHeader("Content-Type", "video/mp4");
    // 브라우저에서 이어보기(탐색)가 되도록 범위 요청을 허용한다.
    res.setHeader("Accept-Ranges", "bytes");
    return res.sendFile(filePath);
  });

  // 만들어 둔 영상 목록 — 화면에서 지난 결과를 다시 볼 수 있게 한다.
  // (그동안은 만든 직후에만 볼 수 있었고 새로고침하면 사라졌다.)
  app.get("/api/video/list", (_req: Request, res: ExpressResponse) => {
    try {
      ensureDirs();
      const items = fs
        .readdirSync(OUTPUT_DIR)
        .filter((f) => f.toLowerCase().endsWith(".mp4"))
        .map((f) => {
          const id = f.replace(/\.mp4$/i, "");
          const full = path.join(OUTPUT_DIR, f);
          const stat = fs.statSync(full);
          const meta = readVideoMeta(id);
          return {
            id,
            title: meta?.title || id,
            groupLabel: meta?.groupLabel ?? "",
            durationSeconds: meta?.durationSeconds ?? null,
            createdAt: meta?.createdAt ?? stat.mtime.toISOString(),
            sizeBytes: stat.size,
            downloadUrl: `/api/video/download/${id}`,
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // 최신 먼저
      return res.json({ videos: items });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "영상 목록을 읽지 못했습니다." });
    }
  });
}
