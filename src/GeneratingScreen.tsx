import { useEffect, useRef, useState } from "react";
import { callPipeline } from "./api";
import type { ProjectState } from "./App";
import { buildCardsAndHook } from "./buildCards";
import type { CollectionResult, VerificationReport, ConstraintReport, HookSeoReport, ScriptResult } from "./types";

type StepStatus = "pending" | "active" | "done" | "error";
interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { id: "collect", label: "자료 수집", status: "pending" },
  { id: "verify", label: "사실 검증", status: "pending" },
  { id: "constraints", label: "제약조건 확인", status: "pending" },
  { id: "hookseo", label: "후킹 문구 작성", status: "pending" },
  { id: "script", label: "대본 작성", status: "pending" },
  { id: "cards", label: "카드뉴스 구성", status: "pending" },
];

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onDone: () => void;
  onCancel: () => void;
}

// [1]자료수집 → [3]검증 → [4]제약조건 → [5]후킹/SEO → [6]대본(제목용) → 카드뉴스 구성까지만
// 내부적으로 순서대로 실행한다. 실제 영상 렌더링(TTS+ffmpeg, 시간이 걸림)은 여기서 하지 않고
// 결과 화면(카드 스튜디오)에서 카드 내용을 확인·수정한 뒤 사용자가 직접 트리거한다 — 렌더링을
// 기다리게 하기 전에 먼저 카드 구조를 빠르게 검토/편집할 수 있게 하기 위함.
// [4]단계에서 경고가 나오면(hasBlockingIssue) 그때만 멈춰서 확인을 구한다.
// ([2]장단점 분석은 순수 참고용 리포트라 결과물에 필요하지 않아 이 자동 흐름에서는 생략함.)
export default function GeneratingScreen({ project, updateProject, onDone, onCancel }: Props) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [blockingWarning, setBlockingWarning] = useState<ConstraintReport | null>(null);
  const [fatalError, setFatalError] = useState("");
  const startedRef = useRef(false);
  const cache = useRef<{ collection?: CollectionResult; verification?: VerificationReport }>({});

  function setStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function runPipeline(skipWarningCheck = false) {
    setFatalError("");
    try {
      let collection = cache.current.collection;
      if (!collection) {
        setStep("collect", { status: "active" });
        // 웹검색 자체가 가끔 빈 결과를 주는 경우가 있어(코드 문제 아님, 실사용 테스트로 확인됨)
        // 최대 3번까지 자동 재시도 — 그냥 "완료"로 표시하고 넘어가면 다음 단계에서
        // "수집된 항목이 없다"는 알 수 없는 오류로 나타나므로 여기서 미리 걸러낸다.
        for (let attempt = 1; attempt <= 3; attempt++) {
          setStep("collect", { status: "active", detail: attempt > 1 ? `재시도 ${attempt}/3` : undefined });
          collection = await callPipeline<CollectionResult>("/api/pipeline/1/collect", { groupId: project.groupId });
          if (collection.sources.length > 0) break;
        }
        if (!collection || !collection.sources.length) {
          throw new Error("자료 수집에서 3번 시도해도 결과를 찾지 못했습니다. 다시 시도해주세요.");
        }
        cache.current.collection = collection;
        setStep("collect", { status: "done", detail: undefined });
      }

      let verification = cache.current.verification;
      if (!verification) {
        setStep("verify", { status: "active" });
        verification = await callPipeline<VerificationReport>("/api/pipeline/3/verify", { groupId: project.groupId });
        cache.current.verification = verification;
        setStep("verify", { status: "done" });
      }

      setStep("constraints", { status: "active" });
      const constraints = await callPipeline<ConstraintReport>("/api/pipeline/4/check", {
        groupId: project.groupId,
        isSponsoredContent: project.isSponsoredContent,
      });
      if (constraints.hasBlockingIssue && !skipWarningCheck) {
        setBlockingWarning(constraints);
        return;
      }
      setBlockingWarning(null);
      setStep("constraints", { status: "done" });

      setStep("hookseo", { status: "active" });
      const hookSeo = await callPipeline<HookSeoReport>("/api/pipeline/5/hook-seo", { groupId: project.groupId, platforms: [project.platformId] });
      setStep("hookseo", { status: "done" });

      setStep("script", { status: "active" });
      const chosenHook = hookSeo.platforms[0]?.hooks[0];
      const script = await callPipeline<ScriptResult>("/api/pipeline/6/script", {
        groupId: project.groupId,
        platformId: project.platformId,
        chosenHook,
      });
      setStep("script", { status: "done" });

      setStep("cards", { status: "active" });
      // AI에게 나레이션을 다시 쓰게 하는 대신, 이미 검증을 통과한 항목의 제목/요약을 그대로
      // 카드로 옮긴다 — 카드 문구에 AI가 지어낸 내용이 섞이지 않게 하기 위함.
      const { hookHeadline, cards } = buildCardsAndHook(collection, verification, hookSeo, script.title);
      setStep("cards", { status: "done" });

      updateProject((prev) => ({
        ...prev,
        collection,
        verification,
        constraints,
        hookSeo,
        hashtags: hookSeo.platforms[0]?.hashtags ?? [],
        script,
        hookHeadline,
        cards,
      }));
      onDone();
    } catch (e: any) {
      setFatalError(e.message || "생성 중 오류가 발생했습니다.");
      setSteps((prev) => prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)));
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon: Record<StepStatus, string> = { pending: "○", active: "●", done: "✓", error: "✕" };

  return (
    <div>
      <h1>{project.groupLabel} 쇼츠 만드는 중...</h1>
      <div className="sub">자동으로 진행됩니다. 완료되면 영상을 바로 보여드려요.</div>

      <div className="card">
        {steps.map((s) => (
          <div className="item" key={s.id}>
            <div className="item-title">
              <span className={`badge ${s.status === "done" ? "ok" : s.status === "error" ? "warning" : s.status === "active" ? "needs_review" : "unchanged"}`}>
                {icon[s.status]}
              </span>
              {s.label}
              {s.detail && <span className="item-meta">({s.detail})</span>}
            </div>
          </div>
        ))}
      </div>

      {blockingWarning && (
        <div className="card" style={{ borderColor: "#f59e0b" }}>
          <div className="card-head"><h2>⚠ 진행 전 확인이 필요합니다</h2></div>
          {blockingWarning.checks
            .filter((c) => c.status === "warning")
            .map((c, i) => (
              <div className="item" key={i}>
                <div className="item-title">{c.label}</div>
                <div>{c.detail}</div>
              </div>
            ))}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button className="primary" onClick={() => runPipeline(true)}>그래도 계속 진행</button>
            <button onClick={onCancel}>취소하고 다시 선택</button>
          </div>
        </div>
      )}

      {fatalError && (
        <div className="card" style={{ borderColor: "#dc2626" }}>
          <div className="error">{fatalError}</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="primary" onClick={() => runPipeline()}>다시 시도</button>
            <button onClick={onCancel}>취소하고 다시 선택</button>
          </div>
        </div>
      )}
    </div>
  );
}
