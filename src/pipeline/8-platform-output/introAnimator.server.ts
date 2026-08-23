// 쇼츠 앞에 붙일 "동적 도입부"를 만든다.
//
// 배경: 참고 영상 5편 중 임신부편(01)에만 3초짜리 움직이는 도입부가 있고 나머지 4편
// (영유아부모/청년/중장년/60세이상)은 후킹 문구로 바로 시작한다. 사용자 요구는
// "기존 내용은 그대로 두고, 임신부편 도입부처럼 동적 요소만 앞에 얹어달라"는 것.
//
// 그래서 이 모듈은 **원본 영상을 다시 만들지 않는다.** 도입부만 따로 만들어서 앞에 이어
// 붙인다(concat). 원본의 화질·내용·길이는 손대지 않는다.
//
// 움직임은 ffmpeg의 시간 표현식으로 만든다. 티켓 이미지를 화면 밖 오른쪽 위에서
// 가운데로 감속하며 날아오게 하고, 뒤따라오는 빛무리를 겹쳐서 반짝이는 궤적을 만든다.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findBrowser } from "./slideRenderer.server";

export interface IntroSpec {
  gradientTop: string; // 원본 영상에서 뽑은 배경색 — 이어 붙였을 때 색이 튀지 않게
  gradientBottom: string;
  bannerText: string; // 상단 배너 (예: "생애주기 정부지원 안내")
  badge: string; // 티켓 위 작은 라벨 (예: "청년기 (19-34세)")
  headline: string; // 티켓 안 굵은 문구 — 원본의 후킹 문구를 그대로 쓴다
  durationSeconds?: number; // 기본 3.0초 (임신부편과 동일)
}

const W = 1080;
const H = 1920;
const DEFAULT_DURATION = 3.0;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shot(browser: string, html: string, out: string, w: number, h: number, transparent: boolean) {
  const htmlPath = out.replace(/\.png$/, ".html");
  fs.writeFileSync(htmlPath, html, { encoding: "utf8" });
  const args = [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--virtual-time-budget=2500",
    `--screenshot=${out}`,
    `--window-size=${w},${h}`,
  ];
  // 티켓은 배경이 비어 있어야 배경 그라데이션 위에 겹칠 수 있다.
  if (transparent) args.push("--default-background-color=00000000");
  args.push(`file:///${htmlPath.replace(/\\/g, "/")}`);
  execFileSync(browser, args, { stdio: "pipe", timeout: 60_000 });
  if (!fs.existsSync(out)) throw new Error(`도입부 이미지를 만들지 못했습니다: ${path.basename(out)}`);
}

function backgroundHtml(spec: IntroSpec): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;font-family:"Malgun Gothic","맑은 고딕",sans-serif;
    background:linear-gradient(180deg, ${spec.gradientTop} 0%, ${spec.gradientTop} 42%, ${spec.gradientBottom} 100%);}
  .banner{position:absolute;top:70px;left:0;right:0;text-align:center;color:rgba(255,255,255,.92);
    font-size:30px;font-weight:700;letter-spacing:1px}
  .bar{position:absolute;bottom:74px;left:90px;right:90px;height:6px;background:rgba(255,255,255,.32);border-radius:3px}
  .bar i{display:block;width:6%;height:100%;background:#fff;border-radius:3px}
  </style></head><body>
  <div class="banner">${esc(spec.bannerText)}</div>
  <div class="bar"><i></i></div>
  </body></html>`;
}

// 금색 티켓 — 임신부편의 "상품권처럼 생긴 금색 카드"를 참고했다.
const TICKET_W = 900;
const TICKET_H = 500;

function ticketHtml(spec: IntroSpec): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${TICKET_W}px;height:${TICKET_H}px;background:transparent;
    font-family:"Malgun Gothic","맑은 고딕",sans-serif;display:flex;align-items:center;justify-content:center}
  .ticket{width:${TICKET_W - 50}px;height:${TICKET_H - 50}px;border-radius:22px;
    background:linear-gradient(150deg,#fff6d4 0%,#f8dc86 30%,#e9bb42 60%,#fbe9a0 100%);
    border:6px solid #c99a24;box-shadow:0 0 90px rgba(255,214,110,.95),0 18px 44px rgba(0,0,0,.3);
    position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:70px 54px 46px}
  .badge{position:absolute;top:28px;left:34px;background:rgba(120,80,10,.18);color:#6b4c07;
    font-size:28px;font-weight:700;padding:9px 22px;border-radius:100px}
  .seal{position:absolute;top:26px;right:34px;width:92px;height:92px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%,#fff6d0,#e0a92c);border:5px solid #c99a24}
  .headline{color:#463104;font-size:54px;font-weight:800;line-height:1.32;text-align:center;word-break:keep-all}
  /* 티켓 위를 사선으로 지나가는 광택 — 정지 화면에서도 금속 느낌이 난다 */
  .shine{position:absolute;inset:0;border-radius:22px;overflow:hidden}
  .shine::after{content:"";position:absolute;top:-60%;left:-30%;width:46%;height:220%;
    transform:rotate(20deg);background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.55) 50%,rgba(255,255,255,0) 100%)}
  </style></head><body>
  <div class="ticket">
    <div class="shine"></div>
    <div class="badge">${esc(spec.badge)}</div>
    <div class="seal"></div>
    <div class="headline">${esc(spec.headline)}</div>
  </div></body></html>`;
}

// 티켓 뒤를 따라오는 빛무리 — 궤적이 반짝이는 느낌을 준다.
const GLOW_SIZE = 760;

function glowHtml(): string {
  const s = GLOW_SIZE;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  body{width:${s}px;height:${s}px;background:transparent;position:relative}
  .g{position:absolute;inset:0;border-radius:50%;
    background:radial-gradient(circle,rgba(255,245,200,1) 0%,rgba(255,228,150,.75) 22%,rgba(255,215,120,.32) 45%,rgba(255,210,110,0) 72%)}
  /* 작은 반짝이 몇 개 — 궤적이 "빛나며 날아온" 느낌을 준다 */
  .sp{position:absolute;background:#fff;border-radius:50%;box-shadow:0 0 22px 8px rgba(255,240,190,.95)}
  </style></head><body>
  <div class="g"></div>
  <div class="sp" style="width:16px;height:16px;left:60%;top:22%"></div>
  <div class="sp" style="width:11px;height:11px;left:74%;top:44%"></div>
  <div class="sp" style="width:13px;height:13px;left:66%;top:64%"></div>
  <div class="sp" style="width:9px;height:9px;left:52%;top:36%"></div>
  </body></html>`;
}

/**
 * 도입부 mp4를 만들어 경로를 돌려준다. 소리는 없다(원본 오디오는 건드리지 않으므로,
 * 이어 붙일 때 도입부 구간은 무음으로 채운다).
 */
export function renderIntroClip(spec: IntroSpec, workDir: string, ffmpegBin: string): string {
  const browser = findBrowser();
  if (!browser) {
    throw new Error("도입부를 만들려면 Chrome 또는 Edge가 필요한데 찾지 못했습니다. CHROME_PATH 환경변수로 지정할 수 있습니다.");
  }
  fs.mkdirSync(workDir, { recursive: true });

  const dur = spec.durationSeconds ?? DEFAULT_DURATION;
  const bgPng = path.join(workDir, "intro_bg.png");
  const tkPng = path.join(workDir, "intro_ticket.png");
  const glPng = path.join(workDir, "intro_glow.png");

  shot(browser, backgroundHtml(spec), bgPng, W, H, false);
  shot(browser, ticketHtml(spec), tkPng, TICKET_W, TICKET_H, true);
  shot(browser, glowHtml(), glPng, GLOW_SIZE, GLOW_SIZE, true);

  // 날아오는 경로: 오른쪽 위 화면 밖 → 화면 가운데.
  // 처음엔 위쪽에 세웠더니 아래가 휑해 보여서, 원본의 후킹 문구가 나오는 높이와
  // 비슷한 화면 중앙으로 내렸다(이어 붙였을 때 시선이 튀지 않는다).
  //   p = 진행도(0~1), e = 1-(1-p)^2  ← 처음 빠르고 끝에서 느려짐
  const flyTime = 1.5;
  const startX = W + 120;
  const startY = -520;
  const endX = Math.round((W - TICKET_W) / 2);
  const endY = Math.round(H / 2 - TICKET_H / 2);
  const p = `min(1\\,t/${flyTime})`;
  const e = `(1-(1-${p})*(1-${p}))`;
  const tx = `(${startX}+(${endX}-${startX})*${e})`;
  const ty = `(${startY}+(${endY}-${startY})*${e})`;

  // 빛무리는 티켓보다 살짝 늦게 따라온다 — 꼬리처럼 보이게.
  const pg = `min(1\\,max(0\\,(t-0.12)/${flyTime}))`;
  const eg = `(1-(1-${pg})*(1-${pg}))`;
  // 빛무리 중심을 티켓 중심에 맞춘 뒤, 살짝 뒤(오른쪽 위)로 밀어 꼬리처럼 보이게 한다.
  const glowOffX = Math.round((TICKET_W - GLOW_SIZE) / 2) + 150;
  const glowOffY = Math.round((TICKET_H - GLOW_SIZE) / 2) - 110;
  const gx = `(${startX}+(${endX}-${startX})*${eg})+(${glowOffX})`;
  const gy = `(${startY}+(${endY}-${startY})*${eg})+(${glowOffY})`;

  const out = path.join(workDir, "intro.mp4");
  const filter = [
    `[0:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[bg]`,
    // 빛무리: 날아오는 동안만 보이고 도착하면 서서히 사라짐
    `[2:v]format=rgba,fade=t=out:st=${(flyTime + 0.15).toFixed(2)}:d=0.5:alpha=1[glow]`,
    `[bg][glow]overlay=x='${gx}':y='${gy}':format=auto[v1]`,
    // 티켓: 나타나면서 날아와 자리잡고 그대로 유지
    `[1:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1[tk]`,
    `[v1][tk]overlay=x='${tx}':y='${ty}':format=auto[vout]`,
  ].join(";");

  const filterPath = path.join(workDir, "intro_filter.txt");
  fs.writeFileSync(filterPath, filter, { encoding: "utf8" });

  execFileSync(
    ffmpegBin,
    [
      "-y",
      "-loop", "1", "-t", dur.toFixed(2), "-i", bgPng,
      "-loop", "1", "-t", dur.toFixed(2), "-i", tkPng,
      "-loop", "1", "-t", dur.toFixed(2), "-i", glPng,
      "-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex_script", filterPath,
      "-map", "[vout]", "-map", "3:a",
      "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-r", "30",
      out,
    ],
    { stdio: "pipe", timeout: 180_000 }
  );

  return out;
}

/**
 * 도입부를 원본 영상 앞에 이어 붙인다. 원본은 다시 인코딩하되 내용은 그대로다
 * (해상도·프레임레이트를 맞춰야 이어 붙일 수 있어서 재인코딩은 불가피).
 */
export function prependIntro(introPath: string, originalPath: string, outPath: string, ffmpegBin: string): void {
  const filter =
    `[0:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[v0];` +
    `[1:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[v1];` +
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];` +
    `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];` +
    `[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]`;

  execFileSync(
    ffmpegBin,
    [
      "-y", "-i", introPath, "-i", originalPath,
      "-filter_complex", filter,
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      outPath,
    ],
    { stdio: "pipe", timeout: 300_000 }
  );
}
