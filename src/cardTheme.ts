// 그룹별 고정 테마 컬러 — Viralux 영상 분석 결과, 정보성 쇼츠는 사진/일러스트로 "의미"를
// 담으려 하지 않고 그룹별로 통일된 그라데이션 색상 + 카드 텍스트로 정보를 전달함(그래서
// "이 이미지가 뭘 뜻하는지 모르겠다"는 문제가 원천적으로 없음). AI가 매번 다른 추상 이미지를
// 생성하던 방식을 버리고, 이 프로젝트도 그룹당 고정 색상 테마로 통일한다.
export interface CardTheme {
  label: string;
  gradientFrom: string;
  gradientTo: string;
  cardBg: string;
  accent: string;
}

export const CARD_THEMES: Record<string, CardTheme> = {
  pregnancy: { label: "임신부", gradientFrom: "#c2185b", gradientTo: "#f8bbd0", cardBg: "#ffffff", accent: "#c2185b" },
  infant_child: { label: "영유아·아동", gradientFrom: "#00838f", gradientTo: "#b2ebf2", cardBg: "#ffffff", accent: "#00838f" },
  teen: { label: "청소년", gradientFrom: "#6a1b9a", gradientTo: "#e1bee7", cardBg: "#ffffff", accent: "#6a1b9a" },
  youth: { label: "청년", gradientFrom: "#1565c0", gradientTo: "#bbdefb", cardBg: "#ffffff", accent: "#1565c0" },
  middle_age: { label: "중장년·신중년", gradientFrom: "#ef6c00", gradientTo: "#ffe0b2", cardBg: "#ffffff", accent: "#ef6c00" },
  senior: { label: "60세 이상", gradientFrom: "#2e7d32", gradientTo: "#c8e6c9", cardBg: "#ffffff", accent: "#2e7d32" },
};

export function getCardTheme(groupId: string): CardTheme {
  return CARD_THEMES[groupId] ?? CARD_THEMES.youth;
}
