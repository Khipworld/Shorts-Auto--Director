import type { CardItem } from "./App";

// 자막 편집기에 보여줄 "예상" 타임코드를 계산한다.
//
// 실제 타이밍은 영상을 만들 때 TTS가 각 줄을 실제로 읽어본 길이로 다시 계산된다
// (videoRender.server.ts). 그전까지는 알 수 없으므로 여기 값은 어디까지나 예상치이고,
// 화면에도 "예상"이라고 표시한다 — 실제와 다를 수 있는 값을 확정된 것처럼 보여주지 않기 위함.
//
// 한국어 나레이션은 대략 초당 5.5자 정도로 읽히고, 줄 사이에 0.3초 간격이 들어간다
// (videoRender.server.ts의 LINE_GAP_SECONDS와 동일한 값).
const CHARS_PER_SECOND = 5.5;
const LINE_GAP_SECONDS = 0.3;
const MIN_LINE_SECONDS = 1.2;

// 2026 쇼츠 트렌드 조사 결과 최적 길이는 20~35초 — 이걸 넘으면 화면에서 경고한다.
export const OPTIMAL_MAX_SECONDS = 35;
export const OPTIMAL_MIN_SECONDS = 20;

export type SegmentKind = "hook" | "body" | "cta";

export interface TimedLine {
  kind: SegmentKind;
  cardIndex: number; // -1 = 후킹 문구, 그 외에는 cards[cardIndex]
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export function estimateLineSeconds(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  return Math.max(MIN_LINE_SECONDS, clean.length / CHARS_PER_SECOND);
}

export function formatTimecode(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 후킹 문구 + 카드들을 자막 줄 목록으로 펼치면서 예상 시간을 누적한다.
// 마지막 카드는 CTA(마무리) 성격이라 태그를 다르게 붙인다 — 쇼츠 구조상 HOOK/BODY/CTA를
// 구분해서 보여주면 어느 구간이 늘어졌는지 한눈에 판단할 수 있다.
export function buildTimedLines(hookHeadline: string, cards: CardItem[]): TimedLine[] {
  const raw: { kind: SegmentKind; cardIndex: number; text: string }[] = [];

  if (hookHeadline.trim()) {
    raw.push({ kind: "hook", cardIndex: -1, text: hookHeadline });
  }
  cards.forEach((c, i) => {
    const text = [c.title, c.detail].filter((t) => t.trim()).join(". ");
    if (!text.trim()) return;
    const isLast = i === cards.length - 1;
    raw.push({ kind: isLast && cards.length > 1 ? "cta" : "body", cardIndex: i, text });
  });

  let cursor = 0;
  return raw.map((line) => {
    const duration = estimateLineSeconds(line.text);
    const startSeconds = cursor;
    cursor += duration + LINE_GAP_SECONDS;
    return { ...line, startSeconds, endSeconds: startSeconds + duration };
  });
}

export function totalEstimatedSeconds(lines: TimedLine[]): number {
  if (!lines.length) return 0;
  return lines[lines.length - 1].endSeconds;
}

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  hook: "후킹",
  body: "본문",
  cta: "마무리",
};
