# [4] 제약조건 파악

저작권/초상권/광고 표시 의무/미성년자 규제 등 플랫폼 정책 위반 소지 체크. 카테고리별 특화 체크리스트.

**상태**: 구현 완료 — [checkConstraints.server.ts](./checkConstraints.server.ts)

"정보/시사성" 카테고리 특화 체크로 정치적 편향·명예훼손을 Claude로 검토(요구서의 "시사/이슈:
명예훼손·정치적 편향 여부" 항목). 그 외:
- 미성년자 규제: 영유아·아동/청소년 그룹이면 자동으로 `needs_review` 표시
- 광고/협찬 표시 의무: 자동으로 판단할 수 없는 항목이라 `isSponsoredContent`를 안 넘기면
  `needs_review`로 남겨 사용자 확인을 요구함 (임의로 통과시키지 않음)
- 저작권/초상권: [imageLicenseAdvisory.ts](./imageLicenseAdvisory.ts) — [7]단계가 어떤 소스에서
  사진을 가져왔는지에 따라 Naver는 초상권 확인 필요로 사전 안내

**엔드포인트**: `POST /api/pipeline/4/check { groupId, isSponsoredContent? }`
