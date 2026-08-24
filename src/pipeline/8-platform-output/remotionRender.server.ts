// Remotion으로 영상 화면을 만든다 (소리 없음).
//
// 왜 소리를 여기서 안 넣나: 나레이션·BGM·효과음 믹싱은 이미 videoRender.server.ts에
// 만들어져 있고 실사용으로 검증됐다(무음구간 0개 확인). 그래서 Remotion은 화면만 만들고
// 소리는 기존 ffmpeg 믹싱을 그대로 쓴 뒤 합친다 — 검증된 부분을 다시 만들지 않기 위함.
//
// 이 모듈이 slideRenderer.server.ts와 introAnimator.server.ts를 대체한다.
// (정지화면을 이어 붙이던 방식으로는 움직임을 넣을 수 없었다.)
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";

export interface RemotionCard {
  number: string;
  title: string;
  detail: string;
  highlight?: string;
}

export interface RemotionInput {
  banner: string;
  badge: string;
  headline: string;
  cards: RemotionCard[];
  ctaHeadline: string;
  ctaButton: string;
  ctaFootnote: string;
  gradientTop: string;
  gradientBottom: string;
  highlight: string;
  channelName?: string;
  logoSrc?: string;
  /** 장면별 길이(초) — 실제 TTS 길이로 채운다 */
  sceneSeconds: number[];
  /** 도입부 길이(초). 0이면 안 넣음 */
  introSeconds: number;
}

const ENTRY = path.join(process.cwd(), "remotion", "index.ts");
const PUBLIC_DIR = path.join(process.cwd(), "public");

// 번들링은 10~30초 걸리므로 서버가 사는 동안 한 번만 하고 재사용한다.
let bundlePromise: Promise<string> | null = null;
function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY,
      publicDir: PUBLIC_DIR,
      // 기본 웹팩 설정으로 충분하다(추가 로더 필요 없음)
      onProgress: () => {},
    }).catch((e) => {
      // 실패하면 다음 요청에서 다시 시도할 수 있게 캐시를 비운다
      bundlePromise = null;
      throw e;
    });
  }
  return bundlePromise;
}

export function isRemotionAvailable(): boolean {
  return fs.existsSync(ENTRY);
}

/**
 * 화면만 있는 mp4를 만들어 경로를 돌려준다.
 * onProgress는 0~1.
 */
export async function renderShortsVideo(
  input: RemotionInput,
  outPath: string,
  fps: number,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const totalSeconds = input.introSeconds + input.sceneSeconds.reduce((a, b) => a + b, 0);
  const durationInFrames = Math.max(1, Math.round(totalSeconds * fps));

  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: "Shorts",
    inputProps: input as unknown as Record<string, unknown>,
  });

  await renderMedia({
    composition: {
      ...composition,
      // 장면 길이가 매번 달라지므로 실제 길이로 덮어쓴다
      durationInFrames,
      fps,
    },
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps: input as unknown as Record<string, unknown>,
    onProgress: ({ progress }) => onProgress?.(progress),
    // 소리는 나중에 ffmpeg로 합치므로 여기서는 뺀다
    muted: true,
  });
}
