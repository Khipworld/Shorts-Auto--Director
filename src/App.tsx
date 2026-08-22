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
  isSponsoredContent?: boolean;

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

export function emptyProject(groupId: string, groupLabel: string, platformId: string, isSponsoredContent: boolean): ProjectState {
  return {
    groupId,
    groupLabel,
    platformId,
    isSponsoredContent,
    hashtags: [],
    hookHeadline: "",
    cards: [],
    narration: "",
    subtitles: [],
  };
}

export default function App() {
  const [view, setView] = useState<View>("start");
  const [project, setProject] = useState<ProjectState | null>(null);

  function startProject(groupId: string, groupLabel: string, platformId: string, isSponsoredContent: boolean) {
    setProject(emptyProject(groupId, groupLabel, platformId, isSponsoredContent));
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
        <ResultScreen project={project} updateProject={updateProject} onStartOver={() => setView("start")} />
      )}
    </>
  );
}
