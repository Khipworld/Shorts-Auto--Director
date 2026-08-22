# [7] 자막 · 영상 소재 생성

**이식 완료**:
- [imageSearch.server.ts](./imageSearch.server.ts) — Wikimedia → Unsplash → Pexels(신규) → Naver 순 실사진 검색 + 검증 체인 (`findVerifiedPhoto`)
- [clipRelevance.server.ts](./clipRelevance.server.ts) — CLIP 기반 무료 로컬 관련성 사전 필터
- [subtitleSplit.server.ts](./subtitleSplit.server.ts) — 나레이션 문단 → 자막 줄 자동 분할 (`splitNarrationIntoSubtitles`)

**아직 이식 안 함**: TTS(나레이션 실음성 생성) — K-Street의 Coqui XTTS-v2는 CPML(비영리 전용) 라이선스라 그대로 재사용 불가. 이 프로젝트는 "실제 오디오 파일 생성 여부"를 처음부터 요구사항으로 명확히 정의(요구서 74행) — ElevenLabs(상업 이용 가능, apiKeys.server.ts에 이미 등록됨) 사용을 우선 검토.

**연결 상태**: `subtitleSplit.server.ts`는 [8]단계([packageOutput.server.ts](../8-platform-output/packageOutput.server.ts))에서 [6]대본의 나레이션을 자막으로 변환하는 데 실제로 쓰이고 있음. `imageSearch.server.ts`/`clipRelevance.server.ts`는 아직 어느 단계에서도 호출되지 않음 — 실제 이미지 선택 로직(어떤 항목에 어떤 사진을 붙일지)은 미착수.
