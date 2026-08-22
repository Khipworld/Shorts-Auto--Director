// 금액/비율이 포함된 항목은 배포 전 원문 재확인이 필요하다는 실무 제약
// ([[project-government-subsidy-content]] — "기초연금, 청년월세지원 등은 원문 재확인 권장")을
// 코드 규칙으로 명시해서 자동 검증 로그에 남긴다. 정규식 매칭이라 AI 판단과 달리 어떤 근거로
// 걸렸는지 그대로 확인 가능함 (판단 근거 투명성 요구사항).
const AMOUNT_PATTERN = /\d[\d,]*\s*(원|만\s*원|억\s*원)/g;
const PERCENT_PATTERN = /\d+(\.\d+)?\s*%/g;

export function detectAmounts(text: string): string[] {
  const matches = [...(text.match(AMOUNT_PATTERN) ?? []), ...(text.match(PERCENT_PATTERN) ?? [])];
  return [...new Set(matches.map((m) => m.trim()))];
}
