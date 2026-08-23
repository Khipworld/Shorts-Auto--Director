import type { CardItem } from "./App";
import type { CollectionResult, VerificationReport, HookSeoReport } from "./types";

// [1]수집+[3]검증 결과를 카드뉴스 구조(번호+제목+핵심수치)로 변환한다. 나레이션 한 문단으로
// AI가 다시 쓰게 하는 대신, 이미 확인된 항목의 제목/요약을 그대로 카드로 옮겨서 "AI가 지어낸
// 내용"이 섞이지 않게 한다 — 미검증 항목은 여기서도 제외.
// 자료 제목은 행정문서 투라서 괄호 안 단서가 붙어 있는 경우가 많다
// (예: "재취업지원서비스 시행지원 (기업 대상, 근로자 혜택 연계)").
// 쇼츠 카드에는 그런 단서가 어울리지 않아 떼어낸다.
function tidyTitle(title: string): string {
  const stripped = title.replace(/\s*[(（][^)）]*[)）]\s*$/g, "").trim();
  return stripped.length >= 4 ? stripped : title.trim();
}

// 글자수로 자르되 단어 중간에서 끊지 않는다.
// 실제 실행에서 "진로 설계..." 처럼 말이 끊긴 카드가 나온 걸 보고 고침 —
// 마지막 띄어쓰기/문장부호까지만 남기고, 그마저 없으면 그냥 자른다.
function shorten(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  const head = clean.slice(0, maxLen);
  const cut = Math.max(head.lastIndexOf(" "), head.lastIndexOf(","), head.lastIndexOf("·"));
  const base = cut > maxLen * 0.5 ? head.slice(0, cut) : head;
  return `${base.replace(/[,·\s]+$/, "")}…`;
}

export function buildCardsAndHook(
  collection: CollectionResult,
  verification: VerificationReport,
  hookSeo: HookSeoReport | undefined,
  scriptTitle: string | undefined
): { hookHeadline: string; cards: CardItem[] } {
  const usableTitles = new Set(verification.results.filter((r) => r.finalStatus !== "unverified").map((r) => r.title));

  const cards: CardItem[] = collection.sources
    .filter((s) => usableTitles.has(s.title))
    .map((s, i) => {
      const firstSentence = s.summary.split(/(?<=[.!?])\s/)[0] || s.summary;
      return {
        badge: String(i + 1).padStart(2, "0"),
        title: tidyTitle(s.title),
        detail: shorten(firstSentence, 60),
      };
    });

  const hookHeadline = hookSeo?.platforms[0]?.hooks[0] || scriptTitle || "";

  return { hookHeadline, cards };
}

export function cardsToNarration(hookHeadline: string, cards: CardItem[]): string {
  const cardLines = cards.map((c) => `${c.title}. ${c.detail}`);
  return [hookHeadline, ...cardLines].join(" ");
}
