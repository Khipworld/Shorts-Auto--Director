// "내 음원 파일" 보관함 — 사용자가 올린 음악 파일을 서버에 저장하고 목록으로 관리한다.
//
// 왜 public/ 이 아니라 .data/music 인가:
// public/ 아래에 파일이 생기면 Vite 개발 서버가 이를 감지해 화면 전체를 새로고침한다.
// 예전에 rendered-output/ 때문에 화면이 초기화되어 작업이 날아간 적이 있어(서버는 다 만들었는데
// 사용자가 결과를 못 받던 문제), 올린 파일은 감시 대상 밖인 .data/ 에 두고 API로 내보낸다.
//
// 파일 자체는 <id>.<확장자> 로 저장하고, 사용자가 붙인 이름은 index.json 에 따로 적는다.
// 한글 파일명이나 같은 이름의 파일을 여러 번 올려도 서로 덮어쓰지 않게 하기 위함.
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
// @ts-ignore - ffmpeg-static은 경로 문자열을 기본 내보내기로 준다
import ffmpegPath from "ffmpeg-static";

const MUSIC_DIR = path.join(process.cwd(), ".data", "music");
const INDEX_PATH = path.join(MUSIC_DIR, "index.json");

/** 한 곡. 파일은 MUSIC_DIR/<id><ext> 에 있다. */
export interface MusicItem {
  id: string;
  name: string;            // 사용자에게 보이는 이름 (원본 파일명, 이름 바꾸기 가능)
  ext: string;             // ".mp3" 등
  sizeBytes: number;
  durationSeconds: number; // 길이를 못 읽으면 0
  uploadedAt: string;      // ISO
}

// 소리 파일만 받는다. 영상 파일을 배경음으로 넣으려는 실수를 막고,
// 아무 파일이나 서버에 쌓이지 않게 하기 위함.
const ALLOWED_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".opus", ".wma"]);
const MAX_BYTES = 80 * 1024 * 1024; // 80MB — 10분짜리 고음질 곡도 들어간다

function ensureDir() {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

function readIndex(): MusicItem[] {
  ensureDir();
  if (!fs.existsSync(INDEX_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
    return Array.isArray(parsed) ? (parsed as MusicItem[]) : [];
  } catch {
    // 목록 파일이 깨졌다고 올린 음원까지 못 쓰게 되면 곤란하므로 빈 목록으로 계속 간다.
    return [];
  }
}

function writeIndex(items: MusicItem[]) {
  ensureDir();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(items, null, 2), "utf-8");
}

function filePathOf(item: MusicItem): string {
  return path.join(MUSIC_DIR, `${item.id}${item.ext}`);
}

/**
 * 영상 렌더러가 쓰는 함수. bgmTrack이 "custom:<id>" 로 오면 실제 파일 경로를 돌려준다.
 * 목록에는 있는데 파일이 사라졌으면 null — 그러면 배경음 없이 영상이 만들어진다.
 */
export function resolveCustomMusicPath(key?: string): string | null {
  if (!key || !key.startsWith("custom:")) return null;
  const id = key.slice("custom:".length);
  const item = readIndex().find((x) => x.id === id);
  if (!item) return null;
  const full = filePathOf(item);
  return fs.existsSync(full) ? full : null;
}

/** 렌더러가 영상 길이를 곡 길이에 맞출 때 쓴다(뮤직비디오 모드). 모르면 0. */
export function customMusicDuration(key?: string): number {
  if (!key || !key.startsWith("custom:")) return 0;
  const item = readIndex().find((x) => x.id === key.slice("custom:".length));
  return item?.durationSeconds ?? 0;
}

/**
 * 곡 길이를 잰다. ffprobe는 ffmpeg-static에 없으므로 ffmpeg가 파일을 훑으면서
 * 표준오류로 뱉는 "Duration: 00:03:21.53" 을 읽는다.
 */
function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve(0);
    const ff = spawn(ffmpegPath as unknown as string, ["-i", file, "-f", "null", "-"], {
      windowsHide: true,
    });
    let err = "";
    ff.stderr.on("data", (d) => { err += String(d); });
    const done = () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(0);
      resolve(Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 10) / 10);
    };
    ff.on("close", done);
    ff.on("error", () => resolve(0));
    // 아주 큰 파일에서 멈추지 않도록 안전장치
    setTimeout(() => { try { ff.kill(); } catch { /* 이미 끝남 */ } done(); }, 20000);
  });
}

/** 파일명에서 확장자만 안전하게 뽑는다. 경로 조작(../) 방지 포함. */
function safeExt(name: string): string {
  const ext = path.extname(path.basename(name || "")).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : "";
}

export function registerMusicLibraryRoutes(app: Express) {
  // 목록
  app.get("/api/music/list", (_req: Request, res: Response) => {
    const items = readIndex()
      .filter((x) => fs.existsSync(filePathOf(x))) // 사용자가 폴더에서 직접 지운 항목은 감춘다
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
    res.json({ items });
  });

  // 올리기 — 파일 내용을 그대로 본문에 담아 보낸다(별도 업로드 라이브러리 없이).
  // 원본 파일명은 한글이 섞일 수 있어 헤더에 encodeURIComponent로 실어 보낸다.
  app.post(
    "/api/music/upload",
    (req: Request, res: Response, next: NextFunction) => {
      express.raw({ type: "*/*", limit: MAX_BYTES })(req, res, (err?: unknown) => {
        if (!err) return next();
        const e = err as { type?: string; message?: string };
        const tooBig = e.type === "entity.too.large";
        res.status(tooBig ? 413 : 400).json({
          error: tooBig
            ? `파일이 너무 큽니다. 최대 ${Math.round(MAX_BYTES / 1024 / 1024)}MB까지 올릴 수 있습니다.`
            : `파일을 받지 못했습니다: ${e.message ?? "알 수 없는 오류"}`,
        });
      });
    },
    async (req: Request, res: Response) => {
      try {
        const raw = String(req.header("x-file-name") ?? "");
        let name = "";
        try { name = decodeURIComponent(raw); } catch { name = raw; }
        name = path.basename(name).trim();
        if (!name) return res.status(400).json({ error: "파일 이름이 없습니다." });

        const ext = safeExt(name);
        if (!ext) {
          return res.status(400).json({
            error: `음악 파일만 올릴 수 있습니다 (${[...ALLOWED_EXT].join(", ")}).`,
          });
        }

        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ error: "파일 내용이 비어 있습니다." });
        }

        ensureDir();
        const id = crypto.randomUUID();
        const dest = path.join(MUSIC_DIR, `${id}${ext}`);
        fs.writeFileSync(dest, body);

        const item: MusicItem = {
          id,
          name,
          ext,
          sizeBytes: body.length,
          durationSeconds: await probeDuration(dest),
          uploadedAt: new Date().toISOString(),
        };
        writeIndex([item, ...readIndex()]);
        res.json({ item });
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
      }
    }
  );

  // 듣기 — 화면에서 미리 들어보는 용도. sendFile이 구간 요청(Range)을 처리해 주므로
  // 재생 막대를 끌어도 정상 동작한다.
  app.get("/api/music/file/:id", (req: Request, res: Response) => {
    const item = readIndex().find((x) => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: "없는 음원입니다." });
    const full = filePathOf(item);
    if (!fs.existsSync(full)) return res.status(404).json({ error: "파일이 사라졌습니다." });
    res.sendFile(full);
  });

  // 이름 바꾸기
  app.patch("/api/music/:id", express.json(), (req: Request, res: Response) => {
    const items = readIndex();
    const item = items.find((x) => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: "없는 음원입니다." });
    const next = String((req.body as { name?: string })?.name ?? "").trim();
    if (!next) return res.status(400).json({ error: "이름이 비었습니다." });
    item.name = next.slice(0, 120);
    writeIndex(items);
    res.json({ item });
  });

  // 지우기 — 목록과 실제 파일을 함께 지운다.
  app.delete("/api/music/:id", (req: Request, res: Response) => {
    const items = readIndex();
    const item = items.find((x) => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: "없는 음원입니다." });
    try { fs.unlinkSync(filePathOf(item)); } catch { /* 이미 없으면 목록만 정리 */ }
    writeIndex(items.filter((x) => x.id !== item.id));
    res.json({ ok: true });
  });
}
