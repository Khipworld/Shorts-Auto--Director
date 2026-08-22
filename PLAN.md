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
| 대본 생성 | `server.ts` (`generate-topic-script` 등) | `src/pipeline/6-script/generateScript.server.ts` | 헬퍼만 재사용, 프롬프트는 새로 작성 완료 |
| TTS(나레이션 실음성) | `tts-service/` (Coqui XTTS-v2) | — | **재사용 불가** — CPML 비영리 전용 라이선스. ElevenLabs(상업 가능, 콘솔에 이미 등록) 우선 검토 |

## 신뢰도 등급 (요구서 [3]단계)

`src/pipeline/3-verification/sourceTrustTiers.ts` — 공식기관(1등급) > 언론사(2등급) >
네이버 등 출처 분명한 플랫폼(3등급) > 미검증(4등급, 대본에 자동 반영 안 됨).

## 개발 우선순위 — 2026-08-22 MVP 8단계 전부 구현 완료

1순위: [1]자료 수집 → [2]장단점 분석 → [3]검증 — 완료
2순위: [4]제약조건 체크리스트 — 완료
3순위: [5]후킹·SEO 분석 — 완료
4순위: [6]대본 → [7]자막·영상 소재 → [8]플랫폼별 출력물 — 완료 (`POST /api/pipeline/8/package`로
[5]→[6]→[7]이 이어져서 제목/설명/해시태그/나레이션/자막/출처가 담긴 업로드 패키지 하나로 나옴)

각 단계 상세와 엔드포인트는 `src/pipeline/<단계>/README.md` 참고.

## 화면 구조 — "주제 입력 → 자동 처리 → 영상 결과 확인/수정" (2026-08-22, 최종 확정)

처음엔 API를 하나씩 눌러보는 테스트용 대시보드(`public/dashboard.html`)만 있었고, 그다음엔
K-Street EditorConsole처럼 [1]~[6] 6단계를 전부 화면에 노출하는 구조로 만들었으나, 사용자가
"자료수집/검증/제약조건은 내부 프로세스여야 하고, 화면에는 결과물(영상)만 보여야 하며 그걸
보고 수정할 수 있어야 한다"고 재차 지적 — 최종적으로 3화면 구조로 확정함:

- `StartScreen.tsx` — 그룹/플랫폼/협찬여부 선택
- `GeneratingScreen.tsx` — [1]자료수집→[3]검증→[4]제약조건→[5]후킹/SEO→[6]대본→[7]자막→
  영상 렌더링을 전부 내부적으로 순서대로 실행, 진행 체크리스트만 표시. [4]에서 경고가 나오면
  그때만 멈춰서 확인을 구함. ([2]장단점 분석은 순수 참고용이라 자동 흐름에서 생략.)
- `ResultScreen.tsx` — 완성된 mp4를 `<video>`로 재생, 나레이션/자막 직접 수정 후 "다시
  만들기"로 재렌더링, 다운로드 버튼(수동 업로드용 — 자동 업로드는 "추후" 범위로 명시적으로
  제외됨)

**이 3화면 구조가 앞으로 추가되는 모든 기능의 기반.** 파이프라인 내부 단계를 화면에 개별
노출하는 방식으로 되돌아가지 말 것.

브라우저로 전체 흐름을 처음부터 끝까지 검증함: 그룹 선택 → 시작 버튼 한 번 → 완전 자동으로
7단계 진행 → 완성된 45초 mp4 확인(TTS 나레이션+자막 번인+AI 배경 이미지) → 자막 한 줄 직접
수정 → 다시 만들기 → 수정 내용이 새 영상에 정확히 반영됨을 프레임 추출로 직접 확인.

## 실제 mp4 영상 렌더링 (2026-08-22)

사용자 지적: "결과물(텍스트)을 확인할 수 없다 — 영상을 보고 수정해야 한다"에 따라
`videoRender.server.ts`/`backgroundImage.server.ts` 신규 구현:
- TTS: K-Street의 로컬 Coqui XTTS-v2(포트 5005)를 그대로 공유해서 사용(사용자가 "잠시 사용"
  결정 — CPML 비영리 전용 라이선스라 실사용 배포 전 재검토 필요)
- 배경 이미지: 처음엔 실사진 검색을 시도했다가, "청년 지원금" 같은 추상적 정책 주제엔
  수능 시험지/광고로고 같은 엉뚱한 사진이 걸리는 걸 실제 렌더링해서 발견 — Pollinations.ai
  AI 일러스트 생성으로 전환(무료, 키 불필요)
- ffmpeg: K-Street의 video-render.server.ts 패턴을 단순화(다중 장면 크로스페이드 대신
  배경 이미지 1장 + 실제 TTS 길이로 재계산한 자막 타이밍)
- **실사용 테스트로 발견/수정한 버그들**: (1) 첫 curl 테스트의 한글 깨짐 — Git Bash 작은따옴표
  인코딩 문제였음(코드 버그 아님), (2) 긴 자막이 화면 폭(1080px)보다 넓어 잘리는 진짜 버그 —
  `wrapForDisplay()` 자동 줄바꿈으로 수정, (3) GeneratingScreen이 [1]자료수집을 "완료"로
  표시했는데 실제로는 빈 결과였던 경우 다음 단계에서 알 수 없는 오류로 나타나던 문제 — 빈
  결과면 최대 3회 자동 재시도하도록 수정.

## 이번 세션 구현의 알려진 한계

- **이미지 선택이 대본 내용과 연결 안 됨** — 영상 배경은 항상 AI 생성 일러스트 1장뿐,
  실제 항목별 사진을 붙이는 로직은 미착수.
- **BGM/SFX 없음** — 나레이션 음성만 있고 배경음악/효과음은 아직 안 붙임(K-Street엔 있었음,
  단순화하려고 이번엔 제외).
- **광고/협찬 표시 여부**([4]단계)는 `isSponsoredContent`를 명시적으로 넘겨야 자동으로
  통과됨 — 안 넘기면 계속 `needs_review`로 남음(의도된 동작, StartScreen에서 체크박스로 받음).
- **자동 업로드 없음** — 사용자 지시대로 "일단 수동 업로드, 추후 자동 업로드"로 범위를
  한정함. 다운로드 버튼까지만 제공.
- **TTS 라이선스 미해결** — Coqui XTTS-v2(CPML)는 "잠시 사용" 결정일 뿐, 실사용 배포 전
  ElevenLabs 등 상업 이용 가능한 대안으로 교체 검토 필요.

## 미정 사항

- [1]단계에 실제로 쓸 자료수집 API/소스 구체 확정 (정부 정책 자료 특성상 공식 API 위주 검토 필요)
- 정부지원사업 카테고리 외 다른 카테고리 착수 시점
- 이미지 선택 로직(장면별 사진), BGM/SFX, 실사용 TTS 방식 최종 결정 시점
- 자동 업로드 착수 시점(플랫폼별 API 연동 필요)
