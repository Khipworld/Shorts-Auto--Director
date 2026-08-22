# 개발 계획서

## 배경

K-Street Evolution Director(`C:\Claude_Project`, `Khipworld/hip_world` 저장소)에서 브랜치가
main 없이 5개로 흩어져 각각 병렬 작업되던 문제, 병합했다고 보고했지만 실제로는 원격에
반영 안 됐던 문제 등이 확인되어(2026-08-22), 쇼츠 제작 기능을 별도 독립 저장소로 분리해서
처음부터 정상적인 main 브랜치 운영으로 다시 시작하기로 함.

## 결정된 사항

1. K-Street 프로젝트는 지금 상태로 계속 끌고 가지 않고, 기능별로 쪼개서 진행한다.
2. 여러 멀티미디어 기능 중 쇼츠 제작 프로그램을 가장 먼저 만든다.
3. K-Street에 이미 있는 코드 중 쓸 수 있는 것은 가져다 재사용한다.
4. main 브랜치 없이 작업하는 방식은 다시 쓰지 않는다.
5. K-Street(`Khipworld/hip_world`)는 커밋 `07c34ab`을 담은 `main` 브랜치로 정리해 보존.
   기존 5개 브랜치(외부 API 키 콘솔/프로그램 실행 가이드/비디오 제작 타당성/작업 요약/
   다음 작업 항목)는 삭제하지 않고 참고용으로 그대로 남김. `hip_world/`(중복 clone),
   `dist/`, `rendered-output/`(구버전 빌드/테스트 산출물)은 정리 완료.
6. 이 신규 저장소(`Khipworld/Shorts-Auto--Director`)는 처음부터 main 브랜치 기준으로
   운영하고, 모듈 완성마다 병합 후 git log로 증거를 남긴다.

## 1차 타깃 카테고리

**정보/시사성 > 정부지원사업·정책 안내** — 이미 진행 중인 정부지원금 안내 쇼츠 시리즈
(임신부_v2/영유아부모_v2/청년_v2/중장년_v2/60세이상_v2 등, Viralux.ai로 제작)와 연결.
후킹 편집 시 카드 전환 속도를 더 빠르게 하지 않는다는 기존 제약([[feedback-shorts-hook-editing]])이
이 카테고리에도 적용됨.

## 재사용 코드 (K-Street → 이 저장소)

| 재사용 대상 | K-Street 원본 위치 | 이 저장소 위치 | 상태 |
|---|---|---|---|
| Claude 텍스트/JSON 생성 헬퍼 | `server.ts` (callClaude*) | `src/core/claude.server.ts` | 이식 완료 |
| 이미지 fetch/vision 헬퍼 | `server.ts` | `src/core/imageFetch.server.ts` | 이식 완료 |
| 실사진 검색(Wikimedia/Unsplash/Naver) + 검증 | `server.ts` | `src/pipeline/7-subtitles-media/imageSearch.server.ts` | 이식 완료, **Pexels 추가** |
| CLIP 무료 로컬 이미지 관련성 검증 | `clip.server.ts` | `src/pipeline/7-subtitles-media/clipRelevance.server.ts` | 이식 완료 |
| 자막 재분할 | `server.ts` (`/api/gemini/align-subtitles`) | `src/pipeline/7-subtitles-media/subtitleSplit.server.ts` | 이식 완료 |
| API 키 관리 콘솔 | `apiKeys.server.ts` | `apiKeys.server.ts` | 이식 완료, Pexels 서비스 추가, YouTube 제외(미사용) |
| 대본 생성 | `server.ts` (`generate-topic-script` 등) | `src/pipeline/6-script/` | **미이식** — 이 프로젝트 주제에 맞게 프롬프트 새로 작성 필요, 헬퍼만 재사용 |
| TTS(나레이션 실음성) | `tts-service/` (Coqui XTTS-v2) | — | **재사용 불가** — CPML 비영리 전용 라이선스. ElevenLabs(상업 가능, 콘솔에 이미 등록) 우선 검토 |

## 신뢰도 등급 (요구서 [3]단계)

`src/pipeline/3-verification/sourceTrustTiers.ts` — 공식기관(1등급) > 언론사(2등급) >
네이버 등 출처 분명한 플랫폼(3등급) > 미검증(4등급, 대본에 자동 반영 안 됨).

## 개발 우선순위

1순위: [1]자료 수집 → [2]장단점 분석 → [3]검증 (여기까지 완성해 사용자 확인)
2순위: [4]제약조건 체크리스트
3순위: [5]후킹·SEO 분석
4순위: [6]대본 → [7]자막·영상 소재(이식 완료) → [8]플랫폼별 출력물

## 미정 사항

- [1]단계에 실제로 쓸 자료수집 API/소스 구체 확정 (정부 정책 자료 특성상 공식 API 위주 검토 필요)
- 정부지원사업 카테고리 외 다른 카테고리 착수 시점
