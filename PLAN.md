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

## 화면 구조 — K-Street와 같은 온보딩→편집→출력 패턴 (2026-08-22)

사용자 지적: 초기에 만든 건 API를 하나씩 눌러보는 테스트용 대시보드(`public/dashboard.html`)
뿐이었고, "결과물이 나오기 전에 메인 화면에서 보고 수정 가능해야 한다"는 K-Street와 같은
화면 구조가 앞으로 기능을 추가할 기반이 되어야 한다는 요구를 받아 Vite+React SPA로 재구성함
(`src/App.tsx`/`StartScreen.tsx`/`EditorScreen.tsx`/`OutputScreen.tsx`, `server.ts`에 K-Street와
동일한 Vite 미들웨어 모드 연결). **앞으로 새 기능도 이 3단계 화면 패턴 위에 얹을 것.**

브라우저로 전체 흐름을 직접 클릭해서 검증함(그룹선택→수집→검증→후킹/SEO→대본생성→나레이션
직접 수정→자막 재분할→출력화면까지 수정 내용이 그대로 반영되는 것 확인). 이 과정에서 실제
버그 1건 발견 및 수정: `EditorScreen`의 상태 업데이트 함수가 같은 이벤트 핸들러 안에서 두 번
불리면 오래된 state를 기준으로 스프레드해서 먼저 한 변경이 사라지는 문제([6]대본 생성 시
narration/script가 저장 안 되고 사라짐) — 함수형 setState로 수정.

## 이번 MVP 구현의 알려진 한계

- **실제 AI 호출을 브라우저로 검증함(2026-08-22)** — 이전 세션에서는 API 키 미설정으로 못
  했었으나, 사용자가 키를 등록한 뒤 "청년" 그룹으로 [1]~[6] 전체를 실제로 실행해 확인함.
  다만 자료수집 웹검색이 가끔(관찰상 2회) 빈 결과를 반환하는 경우가 있었음 — 재시도하면
  성공함, 코드 버그라기보다 Claude 웹 검색 자체의 일시적 변동성으로 보임.
- **이미지 선택이 대본/출력물에 연결 안 됨** — `imageSearch.server.ts`/`clipRelevance.server.ts`는
  이식만 되어 있고, 어떤 항목에 어떤 사진을 붙일지 결정하는 로직은 미착수. 화면에도 아직 없음.
- **실제 mp4 렌더링 없음** — [8]단계 출력물은 텍스트/타임스탬프 패키지까지. TTS 라이선스
  결정(ElevenLabs 검토) 이후 별도 렌더링 백엔드 필요.
- **광고/협찬 표시 여부**([4]단계)는 매 호출마다 `isSponsoredContent`를 명시적으로 넘겨야
  자동으로 통과됨 — 안 넘기면 계속 `needs_review`로 남음 (의도된 동작).

## 미정 사항

- [1]단계에 실제로 쓸 자료수집 API/소스 구체 확정 (정부 정책 자료 특성상 공식 API 위주 검토 필요)
- 정부지원사업 카테고리 외 다른 카테고리 착수 시점
- 이미지 선택 로직, 실제 렌더링 백엔드 착수 시점
