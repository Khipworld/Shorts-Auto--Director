# [6] 대본 생성

[1]~[5] 분석 결과 반영한 대본 초안 생성, 미검증 정보 배제 자동 점검.

**재사용 대상(참고, 아직 이식 안 함)**: K-Street Evolution Director `server.ts`의 Claude 기반 대본 생성 엔드포인트들(`generate-topic-script`, `generate-script-from-image`, `split-custom-script`) — 이 프로젝트의 주제(정부지원사업 등)에 맞게 프롬프트를 새로 써야 하므로 그대로 복사하지 않고, [core/claude.server.ts](../../core/claude.server.ts) 헬퍼만 재사용해서 새로 작성 예정.

**상태**: 미착수 (4순위)
