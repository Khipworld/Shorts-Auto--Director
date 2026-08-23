// 카드뉴스 슬라이드를 실제 이미지(PNG)로 그려내는 모듈.
//
// 왜 이렇게 하나: 화면 미리보기는 CSS로 그려지는데, 영상은 ffmpeg 필터로 따로 그리면
// 둘이 계속 어긋난다(자막 위치에서 이미 한 번 겪음). 그래서 미리보기와 "같은 HTML/CSS"를
// headless Chrome으로 1080x1920에 렌더링해서 영상 프레임으로 쓴다 — 디자인 소스가 하나가 된다.
//
// 알려진 제약: 이 방식은 시스템에 Chrome(또는 Edge)이 설치되어 있어야 한다. 없으면 명확한
// 안내와 함께 실패한다. 배포 시에는 puppeteer 같은 자체 브라우저 번들로 바꾸는 걸 검토할 것.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface SlideTheme {
  gradientFrom: string;
  gradientTo: string;
  accent: string;
}

// 스튜디오의 자막 위치 슬라이더 값. 참고 영상처럼 카드 텍스트 자체가 화면 글씨이므로,
// 이 값은 "자막"이 아니라 가운데 내용 블록의 위치를 움직인다 — 미리보기와 같은 계산식.
export interface SlideLayout {
  vertical: number; // 0~100 (블록의 세로 중심)
  horizontal: number; // 0~100
  margin: number; // 2~20 (%) — 블록 좌우 여백
}

export const DEFAULT_SLIDE_LAYOUT: SlideLayout = { vertical: 50, horizontal: 50, margin: 8 };

export type SlideSpec =
  | { kind: "hook"; badge: string; headline: string }
  | { kind: "card"; number: string; title: string; detail: string }
  | { kind: "cta"; badge: string; headline: string; buttonText: string; footnote: string };

const WIDTH = 1080;
const HEIGHT = 1920;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

export function findBrowser(): string | null {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* 경로 접근 실패는 그냥 다음 후보로 */
    }
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 한 슬라이드의 본문 HTML. 미리보기(StudioScreen의 SlidePreview)와 같은 구성:
// 상단 배너 / 가운데 내용 / 하단 진행바.
function slideBody(slide: SlideSpec, bannerText: string, progressPct: number): string {
  let inner = "";
  if (slide.kind === "hook") {
    inner = `
      <div class="center">
        <div class="badge">${escapeHtml(slide.badge)}</div>
        <div class="headline">${escapeHtml(slide.headline)}</div>
      </div>`;
  } else if (slide.kind === "card") {
    inner = `
      <div class="center">
        <div class="cardnum">${escapeHtml(slide.number)}</div>
        <div class="card">
          <div class="card-title">${escapeHtml(slide.title)}</div>
          ${slide.detail ? `<div class="card-detail">${escapeHtml(slide.detail)}</div>` : ""}
        </div>
      </div>`;
  } else {
    inner = `
      <div class="center">
        <div class="badge">${escapeHtml(slide.badge)}</div>
        <div class="headline">${escapeHtml(slide.headline)}</div>
        <div class="ctabtn">${escapeHtml(slide.buttonText)}</div>
        ${slide.footnote ? `<div class="footnote">${escapeHtml(slide.footnote)}</div>` : ""}
      </div>`;
  }

  return `<div class="slide">
    <div class="banner">${escapeHtml(bannerText)}</div>
    ${inner}
    <div class="progress"><div class="progress-fill" style="width:${progressPct}%"></div></div>
  </div>`;
}

// 슬라이드를 세로로 이어 붙인 한 장짜리 페이지를 만든다 — Chrome을 슬라이드마다 띄우지 않고
// 한 번만 실행해서 통짜로 찍은 뒤 ffmpeg로 잘라 쓰기 위함(속도/안정성).
function buildPageHtml(slides: SlideSpec[], bannerText: string, theme: SlideTheme, layout: SlideLayout): string {
  const bodies = slides
    .map((s, i) => slideBody(s, bannerText, slides.length > 1 ? ((i + 1) / slides.length) * 100 : 100))
    .join("\n");

  // 미리보기(SlidePreview)와 동일한 계산식 — 상자 폭은 여백으로 정하고, 남는 폭 안에서만
  // 좌우로 움직여서 어떤 값에서도 화면 밖으로 나가지 않는다.
  const boxWidthPct = 100 - layout.margin * 2;
  const leftPct = (100 - boxWidthPct) * (layout.horizontal / 100);

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #000; }
  body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; }
  .slide {
    width: ${WIDTH}px; height: ${HEIGHT}px; position: relative; overflow: hidden;
    /* 참고 영상처럼 위가 진하고 아래로 갈수록 밝아지는 세로 그라데이션 */
    background: linear-gradient(180deg, ${theme.gradientFrom} 0%, ${theme.gradientFrom} 42%, ${theme.gradientTo} 100%);
  }
  .banner {
    position: absolute; top: 70px; left: 0; right: 0; text-align: center;
    color: rgba(255,255,255,0.92); font-size: 30px; font-weight: 700; letter-spacing: 1px;
  }
  .center {
    position: absolute; left: ${leftPct}%; width: ${boxWidthPct}%;
    top: ${layout.vertical}%; transform: translateY(-50%);
    text-align: center;
  }
  .badge {
    display: inline-block; background: rgba(255,255,255,0.28); color: #fff;
    font-size: 30px; font-weight: 700; padding: 12px 32px; border-radius: 100px; margin-bottom: 34px;
  }
  .headline {
    color: #fff; font-size: 76px; font-weight: 800; line-height: 1.32;
    text-shadow: 0 3px 18px rgba(0,0,0,0.22); word-break: keep-all;
  }
  .cardnum { color: rgba(255,255,255,0.85); font-size: 40px; font-weight: 700; margin-bottom: 26px; }
  .card {
    background: #fff; border-radius: 34px; padding: 56px 44px;
    box-shadow: 0 18px 50px rgba(0,0,0,0.18);
  }
  .card-title { color: #1a1a1a; font-size: 62px; font-weight: 800; line-height: 1.3; word-break: keep-all; }
  .card-detail { color: #555; font-size: 38px; font-weight: 500; line-height: 1.45; margin-top: 26px; word-break: keep-all; }
  .ctabtn {
    display: inline-block; margin-top: 40px; padding: 22px 44px; border-radius: 100px;
    border: 3px solid rgba(255,255,255,0.75); color: #fff; font-size: 38px; font-weight: 700;
    background: rgba(255,255,255,0.16);
  }
  .footnote { color: rgba(255,255,255,0.78); font-size: 26px; margin-top: 30px; }
  .progress { position: absolute; bottom: 74px; left: 90px; right: 90px; height: 6px; background: rgba(255,255,255,0.32); border-radius: 3px; }
  .progress-fill { height: 100%; background: #fff; border-radius: 3px; }
</style></head>
<body>${bodies}</body></html>`;
}

// 슬라이드들을 PNG로 그려 파일 경로 배열을 돌려준다.
// ffmpegPath는 통짜 스크린샷을 슬라이드별로 잘라내는 데 쓴다.
export function renderSlidesToPng(
  slides: SlideSpec[],
  bannerText: string,
  theme: SlideTheme,
  outDir: string,
  ffmpegBin: string,
  layout: SlideLayout = DEFAULT_SLIDE_LAYOUT
): string[] {
  if (!slides.length) return [];
  const browser = findBrowser();
  if (!browser) {
    throw new Error(
      "카드 이미지를 그리려면 Chrome 또는 Edge가 필요한데 찾지 못했습니다. Chrome을 설치하거나 CHROME_PATH 환경변수에 실행 파일 경로를 지정해주세요."
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "slides.html");
  fs.writeFileSync(htmlPath, buildPageHtml(slides, bannerText, theme, layout), { encoding: "utf8" });

  const sheetPath = path.join(outDir, "sheet.png");
  const totalHeight = HEIGHT * slides.length;
  execFileSync(
    browser,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--virtual-time-budget=3000`,
      `--screenshot=${sheetPath}`,
      `--window-size=${WIDTH},${totalHeight}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "pipe", timeout: 90_000 }
  );

  if (!fs.existsSync(sheetPath)) {
    throw new Error("카드 이미지를 그리지 못했습니다(브라우저가 스크린샷을 만들지 못함).");
  }

  // 통짜 이미지를 슬라이드별로 잘라낸다.
  const paths: string[] = [];
  slides.forEach((_, i) => {
    const out = path.join(outDir, `slide_${String(i).padStart(3, "0")}.png`);
    execFileSync(
      ffmpegBin,
      ["-y", "-i", sheetPath, "-vf", `crop=${WIDTH}:${HEIGHT}:0:${HEIGHT * i}`, "-frames:v", "1", out],
      { stdio: "pipe" }
    );
    paths.push(out);
  });

  return paths;
}
