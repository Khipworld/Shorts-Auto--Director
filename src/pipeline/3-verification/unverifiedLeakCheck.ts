// 여러 단계([5]후킹/SEO, [6]대본)가 공통으로 쓰는 "미검증 항목이 결과물에 새어들어갔는지"
// 점검 유틸. 입력 필터링(unverified 항목 제외)만 믿지 않고, 실제 생성된 텍스트를 다시 검사한다.
//
// 실사용 테스트로 발견한 문제: [5]후킹/SEO는 필터링된 항목 목록만 프롬프트에 넣었는데도,
// 모델이 카테고리 연상으로 목록에 없는 미검증 항목(예: "청년월세지원")의 해시태그를 임의로
// 만들어 붙이는 경우가 있었음 — 입력 제한만으로는 부족해서 출력도 다시 검사해야 함.
export interface LeakCheckResult {
  leaked: boolean;
  matches: string[]; // 새어나온 것으로 판단된 unverified 항목 제목들
}

function tokenize(title: string): string[] {
  return title
    .split(/\s+/)
    .map((t) => t.replace(/^[,.!?"'()ㆍ·]+|[,.!?"'()ㆍ·]+$/g, ""))
    .filter((t) => t.length >= 3);
}

export function checkUnverifiedLeakage(text: string, unverifiedItemTitles: string[]): LeakCheckResult {
  const matches: string[] = [];
  for (const title of unverifiedItemTitles) {
    const tokens = tokenize(title);
    if (tokens.some((t) => text.includes(t))) matches.push(title);
  }
  return { leaked: matches.length > 0, matches };
}

// 해시태그/후킹 문구처럼 여러 개의 짧은 문자열 배열에서, unverified 항목과 겹치는 항목만
// 걸러내고 나머지를 반환한다 (걸러진 것도 함께 반환해서 로그로 남길 수 있게 함).
export function filterLeakedStrings(items: string[], unverifiedItemTitles: string[]): { kept: string[]; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  for (const item of items) {
    const { leaked } = checkUnverifiedLeakage(item, unverifiedItemTitles);
    (leaked ? removed : kept).push(item);
  }
  return { kept, removed };
}
