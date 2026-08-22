# Shorts Auto Director

주제 하나를 입력하면 자료수집 → 장단점 분석 → 사실 검증 → 제약조건 파악 → 후킹/SEO 분석 →
대본 생성 → 자막·영상 소재 생성 → 플랫폼별 출력물까지 자동으로 만드는 쇼츠(숏폼) 제작 프로그램.

K-Street Evolution Director(`Khipworld/hip_world`)에서 파생했지만 완전히 독립된 저장소로
운영합니다. 자세한 배경과 결정 사항은 [PLAN.md](./PLAN.md) 참고.

## 실행

```bash
npm install
npm run dev
```

`http://localhost:3100` — K-Street와 같은 온보딩(그룹 선택) → 편집(단계별 실행+직접 수정) →
출력 화면 구조의 메인 앱. `http://localhost:3100/settings.html` — API 키 등록 화면(최초 1회).
첫 실행 시 `.data/console-password.txt`에 임시 비밀번호가 자동 생성됩니다. 설정 페이지에서
Claude, Unsplash, Pexels, 네이버 등의 키를 등록하세요(Claude 키 하나만 있어도 대부분 동작).

`http://localhost:3100/dashboard.html`은 화면 없이 각 API를 하나씩 눌러보던 초기 테스트용
페이지로, 지금은 메인 앱(`/`)이 실제 사용 화면입니다 — 다만 남겨는 둠(저수준 디버깅용).

## 구조

- `src/App.tsx`, `StartScreen.tsx`, `EditorScreen.tsx`, `OutputScreen.tsx` — 메인 앱 (K-Street의
  온보딩→편집 화면 패턴). **앞으로 추가되는 기능도 이 구조(시작 화면 → 편집 화면에서 단계별
  실행+수정 → 출력 화면) 위에 얹는 것이 기본 방향.**
- `apiKeys.server.ts` — API 키 관리 콘솔 (암호화 저장)
- `src/core/` — Claude 호출, 이미지 fetch 등 파이프라인 전체가 공유하는 헬퍼
- `src/pipeline/1-data-collection` ~ `8-platform-output` — 요구서의 8단계 파이프라인,
  각 폴더가 독립 모듈. 진행 상태는 각 폴더의 README 참고.

## 브랜치 운영 규칙

1. `main`이 항상 최신 안정 상태를 담는다.
2. 모듈 하나 = 브랜치 하나 (`feature/1-data-collection` 등).
3. 모듈 완성 시 반드시 그 자리에서 main으로 병합한다.
4. 병합 직후 `git log main --oneline -1`로 병합 결과를 증거로 남긴다.
5. 커밋·병합은 매번 명시적 요청 후에만 진행한다.
