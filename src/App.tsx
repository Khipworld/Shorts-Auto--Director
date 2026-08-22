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

// 이 화면 세션에서 진행 중인 하나의 쇼츠 작업물 상태.
// 사용자 요구사항: "주제 입력 → 자료수집/검증/제약조건(내부 프로세스) → 결과물(영상을 보고
// 수정) → 수동 업로드" — [1][3][4]단계는 화면에 노출하지 않고 GeneratingScreen이 자동으로
// 순서대로 처리하며, 사용자에게는 시작 화면과 (영상) 결과 화면만 보인다.
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
  narration: string; // 결과 화면에서 사용자가 직접 편집 가능
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
