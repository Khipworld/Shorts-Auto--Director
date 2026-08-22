# [7] 자막 · 영상 소재 생성

**이식 완료**:
- [imageSearch.server.ts](./imageSearch.server.ts) — Wikimedia → Unsplash → Pexels(신규) → Naver 순 실사진 검색 + 검증 체인 (`findVerifiedPhoto`)
- [clipRelevance.server.ts](./clipRelevance.server.ts) — CLIP 기반 무료 로컬 관련성 사전 필터
- [subtitleSplit.server.ts](./subtitleSplit.server.ts) — 나레이션 문단 → 자막 줄 자동 분할 (`splitNarrationIntoSubtitles`)

**아직 이식 안 함**: TTS(나레이션 실음성 생성) — K-Street의 Coqui XTTS-v2는 CPML(비영리 전용) 라이선스라 그대로 재사용 불가. 이 프로젝트는 "실제 오디오 파일 생성 여부"를 처음부터 요구사항으로 명확히 정의(요구서 74행) — ElevenLabs(상업 이용 가능, apiKeys.server.ts에 이미 등록됨) 사용을 우선 검토.
