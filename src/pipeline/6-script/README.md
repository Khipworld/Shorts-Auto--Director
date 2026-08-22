# [6] 대본 생성

[1]~[5] 분석 결과 반영한 대본 초안 생성, 미검증 정보 배제 자동 점검.

**상태**: 구현 완료 — [generateScript.server.ts](./generateScript.server.ts)

K-Street 대본 생성 엔드포인트를 그대로 복사하지 않고 [core/claude.server.ts](../../core/claude.server.ts)
헬퍼만 재사용해서 이 프로젝트 주제에 맞게 새로 작성함.

- [3]검증에서 `unverified`인 항목은 애초에 입력에서 제외
- **그것만 믿지 않고**, 생성된 나레이션에 unverified 항목의 제목 단어가 70% 이상 겹쳐 등장하면
  `unverifiedLeakCheck.leaked`로 표시 (요구사항: "미검증 정보가 대본에서 배제되었는지 자동 점검")
- [5]단계에서 고른 후킹 문구를 나레이션 첫 문장으로 강제 지정 가능(`chosenHook`)
- 플랫폼별 권장 길이(platformSpecs.ts)에 맞춰 목표 글자수 계산 (한국어 나레이션 약 4.5자/초 추정치)

**엔드포인트**: `POST /api/pipeline/6/script { groupId, platformId, chosenHook? }`
