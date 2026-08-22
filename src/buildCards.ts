import type { CardItem } from "./App";
import type { CollectionResult, VerificationReport, HookSeoReport } from "./types";

// [1]수집+[3]검증 결과를 카드뉴스 구조(번호+제목+핵심수치)로 변환한다. 나레이션 한 문단으로
// AI가 다시 쓰게 하는 대신, 이미 확인된 항목의 제목/요약을 그대로 카드로 옮겨서 "AI가 지어낸
// 내용"이 섞이지 않게 한다 — 미검증 항목은 여기서도 제외.
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
      const detail = firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}...` : firstSentence;
      return { badge: String(i + 1).padStart(2, "0"), title: s.title, detail };
    });

  const hookHeadline = hookSeo?.platforms[0]?.hooks[0] || scriptTitle || "";

  return { hookHeadline, cards };
}

export function cardsToNarration(hookHeadline: string, cards: CardItem[]): string {
  const cardLines = cards.map((c) => `${c.title}. ${c.detail}`);
  return [hookHeadline, ...cardLines].join(" ");
}
