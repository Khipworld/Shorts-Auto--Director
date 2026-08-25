// 작업 범위(스코프) 해석 — 파이프라인이 "무엇을, 누구를 대상으로" 만드는지 정한다.
//
// 파이프라인의 모든 단계가 문자열 키 하나(`groupId`)를 받아 대상 정보를 찾던 구조였다.
// 카테고리를 도입하면서 그 키를 "카테고리 + 대상" 두 축으로 넓히되, **키의 형태를
// 문자열로 유지**해서 기존 함수 시그니처와 저장된 수집 이력을 그대로 쓸 수 있게 했다.
//
// 받을 수 있는 키 형태:
//   1. "public_info:임신부"  — 카테고리 + 대상 (새 형식)
//   2. "product"             — 카테고리만 (대상 구분이 없는 카테고리)
//   3. "pregnancy"           — 예전 생애주기 그룹 id (그대로 동작해야 함)
//
// 3번이 중요하다. 기존 정부지원 흐름은 생애주기 그룹 id로 돌아가는데, 그것이
// **공공정보 카테고리 + 해당 대상**으로 해석되어 이전과 똑같이 동작해야 한다.
// 카테고리 전환의 성공 기준이 "결과물이 지금과 같을 것"이기 때문이다.
import { CategoryDef, getCategory, CATEGORIES } from "./categories";
import { LIFECYCLE_GROUPS, getLifecycleGroup } from "../1-data-collection/lifecycleGroups";

export interface TopicScope {
  /** 넘겨받은 원본 키 — 수집 이력 저장에 그대로 쓴다 */
  key: string;
  category: CategoryDef;
  /** 대상 (예: "임신부"). 대상 구분이 없으면 빈 문자열 */
  audience: string;
  /** 프롬프트와 화면에 쓸 이름. 대상이 있으면 대상, 없으면 카테고리 이름 */
  label: string;
  /** 검색 힌트 — 예전 생애주기 그룹에만 있던 값. 없으면 빈 문자열 */
  searchHint: string;
}

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

export function resolveScope(key: string): TopicScope {
  const raw = (key ?? "").trim();

  // 1) "카테고리:대상" 형식
  if (raw.includes(":")) {
    const [catId, ...rest] = raw.split(":");
    const audience = rest.join(":").trim();
    const category = getCategory(catId);
    return {
      key: raw,
      category,
      audience,
      label: audience || category.label,
      searchHint: audience ? `${audience} ${category.summary}` : category.summary,
    };
  }

  // 2) 카테고리 id만
  if (CATEGORY_IDS.has(raw as any)) {
    const category = getCategory(raw);
    return { key: raw, category, audience: "", label: category.label, searchHint: category.summary };
  }

  // 3) 예전 생애주기 그룹 id — 공공정보 + 그 대상으로 해석한다.
  //    검색 힌트도 예전 값을 그대로 써서 결과가 달라지지 않게 한다.
  const group = getLifecycleGroup(raw);
  if (group) {
    return {
      key: raw,
      category: getCategory("public_info"),
      audience: group.label,
      label: group.label,
      searchHint: group.searchHint,
    };
  }

  // 알 수 없는 키 — 기타 카테고리로 떨어뜨리되 키는 보존한다.
  const category = getCategory("etc");
  return { key: raw, category, audience: "", label: raw || category.label, searchHint: category.summary };
}

/**
 * 화면에서 카테고리와 대상을 골랐을 때 파이프라인에 넘길 키를 만든다.
 * 공공정보 + 예전 생애주기 대상이면 **예전 키를 그대로 돌려준다** — 수집 이력이
 * 이어지고 결과도 이전과 같아야 하기 때문.
 */
export function makeScopeKey(categoryId: string, audience: string): string {
  const a = (audience ?? "").trim();
  if (categoryId === "public_info" && a) {
    const legacy = LIFECYCLE_GROUPS.find((g) => g.label === a);
    if (legacy) return legacy.id;
  }
  return a ? `${categoryId}:${a}` : categoryId;
}
