import { useState } from "react";
import StartScreen from "./StartScreen";
import EditorScreen from "./EditorScreen";
import OutputScreen from "./OutputScreen";
import type {
  CollectionResult,
  ProsConsReport,
  VerificationReport,
  ConstraintReport,
  HookSeoReport,
  ScriptResult,
  SubtitleLine,
} from "./types";

export type View = "start" | "editor" | "output";

// 이 화면 세션에서 진행 중인 하나의 쇼츠 작업물 상태. K-Street의 온보딩→편집 화면 패턴처럼,
// 자동 생성된 결과를 여기 담아두고 사용자가 최종 출력 전에 직접 고쳐볼 수 있게 한다.
export interface ProjectState {
  groupId: string;
  groupLabel: string;
  platformId: string;
  isSponsoredContent?: boolean;

  collection?: CollectionResult;
  prosCons?: ProsConsReport;
  verification?: VerificationReport;
  constraints?: ConstraintReport;
  hookSeo?: HookSeoReport;
  chosenHookIndex: number;
  hashtags: string[];

  script?: ScriptResult;
  narration: string; // 사용자가 편집 가능한 나레이션 (script 생성 후 script.narration으로 초기화)
  subtitles: SubtitleLine[];
}

export function emptyProject(groupId: string, groupLabel: string, platformId: string): ProjectState {
  return {
    groupId,
    groupLabel,
    platformId,
    chosenHookIndex: 0,
    hashtags: [],
    narration: "",
    subtitles: [],
  };
}

export default function App() {
  const [view, setView] = useState<View>("start");
  const [project, setProject] = useState<ProjectState | null>(null);

  function startProject(groupId: string, groupLabel: string, platformId: string) {
    setProject(emptyProject(groupId, groupLabel, platformId));
    setView("editor");
  }

  return (
    <>
      {view === "start" && <StartScreen onStart={startProject} />}
      {view === "editor" && project && (
        <EditorScreen
          project={project}
          updateProject={(updater) => setProject((prev) => (prev ? updater(prev) : prev))}
          onBackToStart={() => setView("start")}
          onGoToOutput={() => setView("output")}
        />
      )}
      {view === "output" && project && <OutputScreen project={project} onBack={() => setView("editor")} />}
    </>
  );
}
