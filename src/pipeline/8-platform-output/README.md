# [8] 플랫폼별 출력물 생성

선택 플랫폼 규격(세로 9:16 등) 맞춤 출력 + 제목/설명/해시태그 패키징.

**상태**: 부분 구현 — [packageOutput.server.ts](./packageOutput.server.ts)

[5]후킹/SEO → [6]대본 → [7]자막 분할을 순서대로 실행해서 하나의 "업로드 패키지"(제목/설명/
해시태그/썸네일 문구/나레이션/자막 타임스탬프/출처 목록)로 묶어낸다.

**범위 밖(아직)**: 실제 mp4 렌더링(TTS 음성 합성 + ffmpeg 인코딩)은 포함하지 않음 — TTS
라이선스 결정([[project-shorts-auto-director]], ElevenLabs 검토 중) 이후 별도 렌더링 백엔드로
붙일 예정. 지금은 편집자가 이 패키지를 보고 직접(또는 향후 자동화로) 영상을 만들 수 있는
수준까지.

**엔드포인트**: `POST /api/pipeline/8/package { groupId, platformId }`
