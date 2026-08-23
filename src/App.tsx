import { useState } from "react";
import StartScreen from "./StartScreen";
import GeneratingScreen from "./GeneratingScreen";
import ResultScreen from "./ResultScreen";
import type {
  CollectionResult,
  VerificationReport,
  ConstraintReport,
  HookSeoReport,
  ScriptResult,
  SubtitleLine,
} from "./types";

export type View = "start" | "generating" | "result";

export interface CardItem {
  badge: string; // "01", "02"...
  title: string;
  detail: string;
}

// 자막을 화면 어디에 놓을지. vertical/horizontal은 0~100 비율(50이 정중앙), margin은
// 자막 상자 좌우 여백. 미리보기에는 즉시 반영되지만, 실제 mp4에 반영하려면
// videoRender.server.ts의 drawtext 좌표 계산을 함께 고쳐야 한다(아직 미반영).
export interface SubtitleLayout {
  vertical: number;
  horizontal: number;
  margin: number;
}

// 음향 설정. voicePreset만 실제 렌더링에 전달되고(TTS 서비스가 지원하는 실제 값),
// BGM/SFX는 아직 음원 파일도 믹싱 백엔드도 없어서 화면 상태로만 보관한다.
export interface AudioSettings {
  voicePreset: string;
  bgmPreset: string;
  bgmVolume: number;
  customBgmName: string; // 업로드한 파일명 (파일 자체를 서버로 보내는 기능은 아직 없음)
  customBgmVolume: number;
  sfxPreset: string;
  sfxVolume: number;
}

// 이 화면 세션에서 진행 중인 하나의 쇼츠 작업물 상태.
// 사용자 요구사항: "주제 입력 → 자료수집/검증/제약조건(내부 프로세스) → 결과물(영상을 보고
// 수정) → 수동 업로드" — [1][3][4]단계는 화면에 노출하지 않고 GeneratingScreen이 자동으로
// 순서대로 처리하며, 사용자에게는 시작 화면과 (영상) 결과 화면만 보인다.
//
// 2026-08-22 추가: 실제 Viralux 영상과 비교해본 결과, 나레이션 한 문단 + AI 배경 이미지
// 방식은 "이미지가 뭘 뜻하는지 모르겠다"는 문제가 있었음 — 정부기관 카드뉴스의 표준 포맷
// (번호 배지 + 제목 + 핵심수치 카드)으로 구조를 바꿈. hookHeadline(오프닝 후킹 문구)과
// cards(카드별 제목/핵심수치)가 나레이션/자막을 대체하는 편집 단위.
export interface ProjectState {
  groupId: string;
  groupLabel: string;
  platformId: string;
  topic: string; // 사용자가 직접 입력한 주제 (비어 있으면 그룹 전체를 주제로 봄)
  isSponsoredContent?: boolean;

  formatId: string;
  audio: AudioSettings;
  subtitleLayout: SubtitleLayout;

  collection?: CollectionResult;
  verification?: VerificationReport;
  constraints?: ConstraintReport;
  hookSeo?: HookSeoReport;
  hashtags: string[];

  script?: ScriptResult;
  hookHeadline: string; // 오프닝 화면의 굵은 후킹 문구 (예: "나만 몰랐던 220만원?")
  cards: CardItem[]; // 카드뉴스 형식의 본문 (번호 + 제목 + 핵심수치)
  narration: string; // hookHeadline+cards를 이어 붙인 나레이션 (TTS용, 화면 편집 대상 아님)
  subtitles: SubtitleLine[];
  videoJobId?: string;
}

export interface StartOptions {
  groupId: string;
  groupLabel: string;
  platformId: string;
  topic: string;
  isSponsoredContent: boolean;
}

export function emptyProject(opts: StartOptions): ProjectState {
  return {
    groupId: opts.groupId,
    groupLabel: opts.groupLabel,
    platformId: opts.platformId,
    topic: opts.topic,
    isSponsoredContent: opts.isSponsoredContent,

    formatId: "shorts_9_16",
    audio: {
      voicePreset: "news-anchor",
      bgmPreset: "epic-doc",
      bgmVolume: 60,
      customBgmName: "",
      customBgmVolume: 40,
      sfxPreset: "epic-doc",
      sfxVolume: 50,
    },
    subtitleLayout: { vertical: 58, horizontal: 50, margin: 8 },

    hashtags: [],
    hookHeadline: "",
    cards: [],
    narration: "",
    subtitles: [],
  };
}

// 화면 디자인을 확인할 때 쓰는 예시 데이터. 스튜디오 화면을 보려면 원래는 자료수집부터
// 대본까지 전부 돌려야 하는데(시간도 걸리고 Claude API 비용도 듦), 레이아웃만 손볼 때는
// 그럴 필요가 없어서 `http://localhost:3100/?demo=1`로 바로 열어볼 수 있게 해둔 것.
// 실제 사용 흐름에는 영향이 없다(주소에 ?demo=1을 붙였을 때만 동작).
function demoProject(): ProjectState {
  const base = emptyProject({
    groupId: "youth",
    groupLabel: "청년",
    platformId: "youtube_shorts",
    topic: "2026년 청년 지원 정책 총정리",
    isSponsoredContent: false,
  });
  return {
    ...base,
    hookHeadline: "2026년 청년 지원금 4가지, 이거 모르면 손해입니다",
    cards: [
      { badge: "01", title: "청년미래적금 신규 도입", detail: "3년 만기 시 최대 2,200만원 목돈 마련" },
      { badge: "02", title: "청년월세 특별지원", detail: "상시 신청 제도로 전환, 월 최대 20만원" },
      { badge: "03", title: "청년일자리도약장려금", detail: "지원 대상과 규모가 함께 확대" },
      { badge: "04", title: "신청은 복지로에서", detail: "각 기관 홈페이지에서 조건 확인 필수" },
    ],
    hashtags: ["#청년지원금", "#청년미래적금", "#2026정책"],
  };
}

export default function App() {
  const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");
  const [view, setView] = useState<View>(isDemo ? "result" : "start");
  const [project, setProject] = useState<ProjectState | null>(isDemo ? demoProject() : null);

  function startProject(opts: StartOptions) {
    setProject(emptyProject(opts));
    setView("generating");
  }

  const updateProject = (updater: (prev: ProjectState) => ProjectState) =>
    setProject((prev) => (prev ? updater(prev) : prev));

  return (
    <>
      {view === "start" && <StartScreen onStart={startProject} />}
      {view === "generating" && project && (
        <GeneratingScreen project={project} updateProject={updateProject} onDone={() => setView("result")} onCancel={() => setView("start")} />
      )}
      {view === "result" && project && (
        <ResultScreen
          project={project}
          updateProject={updateProject}
          onStartOver={() => setView("start")}
          // 스튜디오에서 주제를 고치고 "자료 다시 찾기"를 누른 경우. GeneratingScreen이
          // 새로 만들어지면서 지금 project.topic으로 파이프라인을 처음부터 다시 돈다.
          onRegenerate={() => setView("generating")}
        />
      )}
    </>
  );
}
