# [1] 자료 수집

주제 입력 → 웹/뉴스 등 복수 출처 수집, 출처 URL·수집 시각 저장.

**상태**: 구현 완료 (정부지원사업·정책 안내 카테고리, 생애주기 6개 그룹)

- [lifecycleGroups.ts](./lifecycleGroups.ts) — 6개 그룹 정의([[project-government-subsidy-content]]와 동일 구성)
- [collectSources.server.ts](./collectSources.server.ts) — Claude 웹 검색(2단계: 검색→구조화)으로 항목 수집, 신뢰도 등급([3]단계 참고) 부여
- [snapshotStore.ts](./snapshotStore.ts) — 회차별 수집 결과를 `.data/collection-history/<groupId>.json`에 이력으로 저장해 신규/변경/동일을 실제 비교로 판정 (Cowork 파이프라인의 "자체 판단" 한계를 해결)

**설계상 반영한 제약([[project-government-subsidy-content]])**:
- 정부24/고용노동부 등 공식 사이트를 직접 스크래핑하지 않음 — Claude의 웹 검색에 맡기고 언론/2차 출처 위주로 수집, 공식 도메인은 인용 시 신뢰도 표시로만 활용
- 최소 3개 이상 서로 다른 출처 확보를 `belowMinimumSources` 플래그로 체크
- **아직 자동화 안 함**: 고액 항목(기초연금, 청년월세지원 등) 배포 전 원문 재확인 — 이건 [3]검증 단계에서 사람 확인 절차로 남겨둘 예정, 자동 통과시키면 안 됨

**엔드포인트**: `GET /api/pipeline/1/groups`, `POST /api/pipeline/1/collect { groupId }`
