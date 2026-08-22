# [2] 장단점 분석

수집된 자료를 바탕으로 화제성·공감도·정보가치(장점) 대 민감성·편향·신뢰도(단점)를 항목화한 리포트 출력.

**상태**: 구현 완료 — [analyzeProsCons.server.ts](./analyzeProsCons.server.ts)

[1]단계가 저장해 둔 최신 수집 결과(`getLatestRun`)를 그대로 이어받아 다시 검색하지 않고 분석만
수행. 항목별 pros/cons + 그룹 전체에 대한 종합 의견(overallRecommendation) 반환.

**엔드포인트**: `POST /api/pipeline/2/analyze { groupId }` (사전에 `/api/pipeline/1/collect`가
실행되어 있어야 함)
