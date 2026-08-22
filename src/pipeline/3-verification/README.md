# [3] 사실/신뢰성 검증

출처 간 교차 확인, 신뢰도 등급 표시, 미검증 정보 자동 배제.

**상태**: 구현 완료 — [verifySources.server.ts](./verifySources.server.ts)

- [sourceTrustTiers.ts](./sourceTrustTiers.ts) — 신뢰도 등급: 공식기관 > 언론사 > 네이버 등 출처 분명한 플랫폼 > 미검증, 4단계
- [detectAmounts.ts](./detectAmounts.ts) — 금액/비율 정규식 감지 (배포 전 원문 재확인 대상 자동 표시, [[project-government-subsidy-content]] 실무 제약 반영)
- 교차 확인: Claude에게 전체 항목을 한 번에 주고 "같은 정책을 다루는 항목끼리 묶고 내용이 일치하는지" 판정받은 뒤, 아래 규칙으로 최종 상태 결정 (순서대로 적용, 전부 `decisionLog`에 남음):
  1. 다른 출처와 내용 상충 → `unverified`
  2. 금액/비율 포함 → `needs_manual_check` (자동으로 대본에 반영 안 됨, 사람 재확인 필요)
  3. 4등급(미검증) 출처이고 다른 출처 뒷받침 없음 → `unverified`
  4. 그 외 → `verified`

"형식적으로만 통과되는 검증"을 막기 위해 각 항목의 `decisionLog`에 실제 판단 근거(신뢰도 등급,
교차확인 결과, 감지된 금액)를 그대로 남김 (요구서 49행 주의사항 반영).

**엔드포인트**: `POST /api/pipeline/3/verify { groupId }` (사전에 `/api/pipeline/1/collect` 필요)
