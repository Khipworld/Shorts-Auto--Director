import React from "react";
import { AbsoluteFill, Sequence, Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// 렌더링 방식 비교용 샘플.
//
// 지금 방식(HTML 정지화면 + ffmpeg 이어붙이기)은 움직임을 거의 못 넣는다.
// 같은 내용을 프레임 단위로 그리면 얼마나 달라지는지 보려고 만든 것이다.
// 비교가 공정하도록 색상·문구·구성은 기존 결과물과 똑같이 맞췄다.

export interface Card {
  number: string;
  title: string;
  detail: string;
  /** 화면에서 크게 강조할 핵심 수치. 없으면 강조 안 함 */
  highlight?: string;
}

export interface ShortsProps {
  banner: string;
  badge: string;
  headline: string;
  cards: Card[];
  ctaHeadline: string;
  ctaButton: string;
  ctaFootnote: string;
  gradientTop: string;
  gradientBottom: string;
  /** 각 장면 길이(초). 나레이션 길이에 맞춰 넘겨준다 */
  sceneSeconds: number[];
  /** 채널명 — 상단 배너에 표시 */
  channelName?: string;
  /** 로고 파일 (public 기준). 없으면 로고 없이 나감 */
  logoSrc?: string;
  /** 핵심 수치 강조 색 */
  highlight?: string;
  /** 맨 앞 도입부 길이(초). 0이면 도입부 없음 */
  introSeconds?: number;
}

const FONT = '"Malgun Gothic", "맑은 고딕", sans-serif';

// 서버에서 "/brand/logo.png" 같은 웹 경로로 넘어오는데, Remotion은 자기 public 폴더를
// 기준으로 찾아야 하므로 여기서 변환한다(안 하면 렌더링 중 이미지 로딩 실패).
function resolveAsset(src?: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//.test(src)) return src;
  return staticFile(src.replace(/^\/+/, ""));
}

function Background({ top, bottom }: { top: string; bottom: string }) {
  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(180deg, ${top} 0%, ${top} 42%, ${bottom} 100%)` }}
    />
  );
}

function Banner({ text, logoSrc, channelName }: { text: string; logoSrc?: string; channelName?: string }) {
  const frame = useCurrentFrame();
  // 배너는 처음에 살짝 내려오며 나타난 뒤 계속 고정
  const y = interpolate(frame, [0, 18], [-30, 0], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 18], [0, 0.92], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute", top: 70, left: 0, right: 0, textAlign: "center",
        color: "#fff", fontSize: 30, fontWeight: 700, letterSpacing: 1,
        fontFamily: FONT, opacity, transform: `translateY(${y}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
        {logoSrc && <Img src={resolveAsset(logoSrc)!} style={{ width: 56, height: 56 }} />}
        <span>{channelName ? `${channelName} · ${text}` : text}</span>
      </div>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div style={{ position: "absolute", bottom: 74, left: 90, right: 90, height: 6, background: "rgba(255,255,255,.32)", borderRadius: 3 }}>
      <div style={{ width: `${progress * 100}%`, height: "100%", background: "#fff", borderRadius: 3 }} />
    </div>
  );
}

/** 후킹 화면 — 뱃지가 먼저 뜨고 문구가 한 줄씩 올라온다 */
function HookScene({ badge, headline }: { badge: string; headline: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const lines = headline.split(",").map((s, i, arr) => (i < arr.length - 1 ? s + "," : s));

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px" }}>
      <div style={{ textAlign: "center", width: "100%" }}>
        <div
          style={{
            display: "inline-block", background: "rgba(255,255,255,.28)", color: "#fff",
            fontSize: 30, fontWeight: 700, padding: "12px 32px", borderRadius: 100,
            marginBottom: 34, fontFamily: FONT,
            opacity: badgeIn, transform: `scale(${0.85 + badgeIn * 0.15})`,
          }}
        >
          {badge}
        </div>
        {lines.map((line, i) => {
          // 줄마다 조금씩 늦게 올라오게 — 시선이 자연스럽게 따라간다
          const delay = 8 + i * 7;
          const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 22 });
          return (
            <div
              key={i}
              style={{
                color: "#fff", fontSize: 76, fontWeight: 800, lineHeight: 1.32,
                textShadow: "0 3px 18px rgba(0,0,0,.22)", fontFamily: FONT, wordBreak: "keep-all",
                opacity: p, transform: `translateY(${(1 - p) * 40}px)`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** 카드 화면 — 카드가 올라오고, 핵심 수치는 뒤이어 크게 강조된다 */
function CardScene({ card, highlight }: { card: Card; highlight: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const numIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const cardIn = spring({ frame: frame - 5, fps, config: { damping: 18, mass: 0.7 }, durationInFrames: 28 });
  const hlIn = spring({ frame: frame - 22, fps, config: { damping: 14, mass: 0.6 }, durationInFrames: 24 });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px" }}>
      <div style={{ width: "100%", textAlign: "center" }}>
        <div
          style={{
            color: "rgba(255,255,255,.85)", fontSize: 40, fontWeight: 700, marginBottom: 26,
            fontFamily: FONT, opacity: numIn, transform: `translateY(${(1 - numIn) * 16}px)`,
          }}
        >
          {card.number}
        </div>
        <div
          style={{
            background: "#fff", borderRadius: 34, padding: "56px 44px",
            boxShadow: "0 18px 50px rgba(0,0,0,.18)",
            opacity: cardIn, transform: `translateY(${(1 - cardIn) * 60}px) scale(${0.94 + cardIn * 0.06})`,
          }}
        >
          <div style={{ color: "#1a1a1a", fontSize: 62, fontWeight: 800, lineHeight: 1.3, fontFamily: FONT, wordBreak: "keep-all" }}>
            {card.title}
          </div>
          {card.highlight && (
            <div
              style={{
                color: highlight, fontSize: 68, fontWeight: 800, marginTop: 22, fontFamily: FONT,
                opacity: hlIn, transform: `scale(${0.7 + hlIn * 0.3})`,
              }}
            >
              {card.highlight}
            </div>
          )}
          {card.detail && (
            <div style={{ color: "#555", fontSize: 38, fontWeight: 500, lineHeight: 1.45, marginTop: 20, fontFamily: FONT, wordBreak: "keep-all" }}>
              {card.detail}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** 마무리 화면 — 버튼이 살짝 맥동해서 시선을 끈다 */
function CtaScene({ badge, headline, button, footnote }: { badge: string; headline: string; button: string; footnote: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const pulse = 1 + Math.sin((frame / fps) * 4) * 0.025;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px" }}>
      <div style={{ textAlign: "center", opacity: inP, transform: `translateY(${(1 - inP) * 30}px)` }}>
        <div style={{ display: "inline-block", background: "rgba(255,255,255,.28)", color: "#fff", fontSize: 30, fontWeight: 700, padding: "12px 32px", borderRadius: 100, marginBottom: 34, fontFamily: FONT }}>
          {badge}
        </div>
        <div style={{ color: "#fff", fontSize: 76, fontWeight: 800, lineHeight: 1.32, fontFamily: FONT, wordBreak: "keep-all", textShadow: "0 3px 18px rgba(0,0,0,.22)" }}>
          {headline}
        </div>
        <div
          style={{
            display: "inline-block", marginTop: 40, padding: "22px 44px", borderRadius: 100,
            border: "3px solid rgba(255,255,255,.75)", color: "#fff", fontSize: 38, fontWeight: 700,
            background: "rgba(255,255,255,.16)", fontFamily: FONT, transform: `scale(${pulse})`,
          }}
        >
          {button}
        </div>
        <div style={{ color: "rgba(255,255,255,.78)", fontSize: 26, marginTop: 30, fontFamily: FONT }}>{footnote}</div>
      </div>
    </AbsoluteFill>
  );
}

/**
 * 도입부 — 금색 티켓이 빛을 끌며 날아와 자리잡는다.
 *
 * 예전에는 ffmpeg 시간 표현식으로 만들었는데(introAnimator.server.ts),
 * 여기로 옮기면서 훨씬 다루기 쉬워졌다. 티켓이 회전하며 들어오고 도착할 때
 * 살짝 튕기는 동작은 ffmpeg로는 사실상 불가능했던 것이다.
 */
function IntroScene({ badge, headline, logoSrc }: { badge: string; headline: string; logoSrc?: string }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // 감속하며 날아와 자리잡고, 도착 직후 아주 살짝 튕긴다
  const fly = spring({ frame, fps, config: { damping: 14, mass: 0.9, stiffness: 90 }, durationInFrames: 45 });
  const x = interpolate(fly, [0, 1], [width * 0.9, 0]);
  const y = interpolate(fly, [0, 1], [-520, 0]);
  const rot = interpolate(fly, [0, 1], [22, 0]);
  const glow = interpolate(frame, [0, 12, 45, 62], [0, 0.95, 0.6, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* 뒤따라오는 빛무리 */}
      <div
        style={{
          position: "absolute", width: 760, height: 760, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,245,200,1) 0%, rgba(255,228,150,.7) 22%, rgba(255,215,120,0) 68%)",
          opacity: glow, transform: `translate(${x * 1.12 + 110}px, ${y * 1.12 - 90}px)`,
        }}
      />
      <div
        style={{
          width: 900, padding: "70px 54px 46px", borderRadius: 22, position: "relative",
          background: "linear-gradient(150deg,#fff6d4 0%,#f8dc86 30%,#e9bb42 60%,#fbe9a0 100%)",
          border: "6px solid #c99a24",
          boxShadow: "0 0 90px rgba(255,214,110,.9), 0 18px 44px rgba(0,0,0,.3)",
          transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
          textAlign: "center",
        }}
      >
        <div style={{ position: "absolute", top: 28, left: 34, background: "rgba(120,80,10,.18)", color: "#6b4c07", fontSize: 28, fontWeight: 700, padding: "9px 22px", borderRadius: 100, fontFamily: FONT }}>
          {badge}
        </div>
        {logoSrc ? (
          <Img src={resolveAsset(logoSrc)!} style={{ position: "absolute", top: 22, right: 30, width: 92, height: 92 }} />
        ) : (
          <div style={{ position: "absolute", top: 26, right: 34, width: 92, height: 92, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#fff6d0,#e0a92c)", border: "5px solid #c99a24" }} />
        )}
        <div style={{ color: "#463104", fontSize: 54, fontWeight: 800, lineHeight: 1.32, fontFamily: FONT, wordBreak: "keep-all" }}>
          {headline}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const Shorts: React.FC<ShortsProps> = ({
  banner, badge, headline, cards, ctaHeadline, ctaButton, ctaFootnote,
  gradientTop, gradientBottom, sceneSeconds, channelName, logoSrc, highlight,
  introSeconds = 0,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const introFrames = Math.round(introSeconds * fps);
  const lens = sceneSeconds.map((s) => Math.round(s * fps));
  const starts: number[] = [];
  let acc = introFrames;
  for (const l of lens) { starts.push(acc); acc += l; }

  return (
    <AbsoluteFill>
      <Background top={gradientTop} bottom={gradientBottom} />
      <Banner text={banner} logoSrc={logoSrc} channelName={channelName} />

      {introFrames > 0 && (
        <Sequence from={0} durationInFrames={introFrames}>
          <IntroScene badge={badge} headline={headline} logoSrc={logoSrc} />
        </Sequence>
      )}

      <Sequence from={starts[0]} durationInFrames={lens[0]}>
        <HookScene badge={badge} headline={headline} />
      </Sequence>

      {cards.map((c, i) => (
        <Sequence key={i} from={starts[i + 1]} durationInFrames={lens[i + 1]}>
          <CardScene card={c} highlight={highlight ?? "#c2185b"} />
        </Sequence>
      ))}

      <Sequence from={starts[starts.length - 1]} durationInFrames={lens[lens.length - 1]}>
        <CtaScene badge={badge} headline={ctaHeadline} button={ctaButton} footnote={ctaFootnote} />
      </Sequence>

      <ProgressBar progress={frame / durationInFrames} />
    </AbsoluteFill>
  );
};
