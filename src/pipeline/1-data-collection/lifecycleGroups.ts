// "정보/시사성 > 정부지원사업·정책 안내" 1차 카테고리의 생애주기 6개 그룹 정의.
// [[project-government-subsidy-content]] 참고 — Cowork 파이프라인과 동일한 그룹 구성을 써서
// 나중에 결과물을 서로 비교/검증하기 쉽게 맞춤.
export interface LifecycleGroup {
  id: string;
  label: string;
  searchHint: string;
}

export const LIFECYCLE_GROUPS: LifecycleGroup[] = [
  { id: "pregnancy", label: "임신부", searchHint: "임신부 출산 지원 정책" },
  { id: "infant_child", label: "영유아·아동", searchHint: "영유아 아동 양육 지원 정책" },
  { id: "teen", label: "청소년", searchHint: "청소년 지원 정책" },
  { id: "youth", label: "청년", searchHint: "청년 지원 정책" },
  { id: "middle_age", label: "중장년·신중년", searchHint: "중장년 신중년 고용 재취업 지원 정책" },
  { id: "senior", label: "60세 이상", searchHint: "노인 60세 이상 복지 지원 정책" },
];

export function getLifecycleGroup(id: string): LifecycleGroup | undefined {
  return LIFECYCLE_GROUPS.find((g) => g.id === id);
}
