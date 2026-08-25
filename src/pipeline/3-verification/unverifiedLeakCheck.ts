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
    .split(/[\s()\[\]{}«»""''–—―/]+/)
    .map((t) => t.replace(/^[,.!?"'()ㆍ·–—-]+|[,.!?"'()ㆍ·–—-]+$/g, ""))
    .filter((t) => t.length >= 3);
}

// 연도나 숫자뿐인 낱말은 어떤 항목에나 들어 있어서 누출 근거가 되지 못한다.
// ("2026년"이 겹친다는 이유로 전혀 다른 항목을 누출로 판정한 일이 실측에서 있었음)
function isGeneric(token: string): boolean {
  return /^\d+(년|월|일|차|위|개|건|%)?$/.test(token);
}

/**
 * 미검증 항목이 결과물에 새어들어갔는지 본다.
 *
 * 예전에는 낱말 하나만 겹쳐도 누출로 봤는데, "2026년"이나 "트렌드"처럼 흔한 말 때문에
 * 관계없는 항목이 계속 걸렸다(실측: 밈 이야기가 한 줄도 없는 나레이션이 밈 항목 누출로 판정).
 * 그래서 근거를 두 가지 중 하나로 좁혔다.
 *  - 그 항목에서만 나올 법한 긴 낱말(5자 이상)이 그대로 등장하거나
 *  - 짧은 낱말이라도 두 개 이상 함께 등장하거나
 */
export function checkUnverifiedLeakage(
  text: string,
  unverifiedItemTitles: string[],
  /**
   * 쓸 수 있는(검증된·확인필요) 항목 제목들. 여기에도 들어 있는 낱말은 누출 근거가 되지 못한다.
   *
   * 실측: 트렌드 영상에서 나레이션이 신한카드 이야기만 하는데도 "트렌드", "키워드"가
   * 겹친다는 이유로 전혀 다른 항목(『트렌드 코리아 2026』)을 누출로 판정했다.
   * 그 낱말들은 주제 자체의 말이라 어느 항목에나 들어 있어 구별에 쓸 수 없다.
   */
  usableItemTitles: string[] = []
): LeakCheckResult {
  const shared = new Set<string>();
  for (const t of usableItemTitles) for (const tok of tokenize(t)) shared.add(tok);

  const matches: string[] = [];
  for (const title of unverifiedItemTitles) {
    const tokens = tokenize(title).filter((t) => !isGeneric(t) && !shared.has(t));
    const hit = tokens.filter((t) => text.includes(t));
    const distinctive = hit.some((t) => t.length >= 5);
    if (distinctive || hit.length >= 2) matches.push(title);
  }
  return { leaked: matches.length > 0, matches };
}

// 해시태그/후킹 문구처럼 여러 개의 짧은 문자열 배열에서, unverified 항목과 겹치는 항목만
// 걸러내고 나머지를 반환한다 (걸러진 것도 함께 반환해서 로그로 남길 수 있게 함).
export function filterLeakedStrings(
  items: string[],
  unverifiedItemTitles: string[],
  usableItemTitles: string[] = []
): { kept: string[]; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  for (const item of items) {
    const { leaked } = checkUnverifiedLeakage(item, unverifiedItemTitles, usableItemTitles);
    (leaked ? removed : kept).push(item);
  }
  return { kept, removed };
}
