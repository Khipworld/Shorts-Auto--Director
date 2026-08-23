import { useRef, useState } from "react";
import { callPipeline } from "./api";
import { buildCardsAndHook } from "./buildCards";
import type { ProjectState } from "./App";
import type {
  CollectionResult,
  VerificationReport,
  ConstraintReport,
  HookSeoReport,
  AdReferenceReport,
  ScriptResult,
} from "./types";

// 자료수집 → 검증 → 제약조건 → 광고사례 → 후킹 → 대본 → 카드 구성.
//
// 사용자 지시: "자료 수집부터 카드뉴스 구성까지는 사용자가 볼 필요 없는 백엔드 작업이니
// 굳이 화면에 띄어 표시할 필요 없음" — 그래서 단계별 체크리스트를 없애고, 화면에는
// "지금 무엇을 하는 중인지" 한 줄만 남긴다. 제약조건에서 경고가 나올 때만 멈춰서 물어본다.
export interface PipelineState {
  running: boolean;
  statusText: string;
  error: string;
  blockingWarning: ConstraintReport | null;
}

export function usePipeline(
  project: ProjectState | null,
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void
) {
  const [state, setState] = useState<PipelineState>({
    running: false,
    statusText: "",
    error: "",
    blockingWarning: null,
  });
  // 경고를 무시하고 이어갈 때 이미 끝낸 단계를 다시 돌리지 않기 위한 캐시.
  const cache = useRef<{ collection?: CollectionResult; verification?: VerificationReport }>({});

  function reset() {
    cache.current = {};
    setState({ running: false, statusText: "", error: "", blockingWarning: null });
  }

  async function run(opts: { groupId: string; groupLabel: string; platformId: string; topic: string; isSponsoredContent: boolean }, skipWarningCheck = false) {
    setState({ running: true, statusText: "자료 찾는 중...", error: "", blockingWarning: null });
    try {
      let collection = cache.current.collection;
      if (!collection) {
        // 웹검색이 가끔 빈 결과를 준다(코드 문제 아님, 실사용에서 확인됨) — 최대 3번 재시도.
        for (let attempt = 1; attempt <= 3; attempt++) {
          setState((s) => ({ ...s, statusText: attempt > 1 ? `자료 찾는 중... (재시도 ${attempt}/3)` : "자료 찾는 중..." }));
          collection = await callPipeline<CollectionResult>("/api/pipeline/1/collect", {
            groupId: opts.groupId,
            topic: opts.topic || undefined,
          });
          if (collection.sources.length > 0) break;
        }
        if (!collection || !collection.sources.length) {
          throw new Error(
            opts.topic
              ? `"${opts.topic}" 주제로 3번 찾아봤지만 근거가 될 자료를 찾지 못했습니다. 주제를 조금 더 넓게 바꿔서 다시 시도해보세요.`
              : "자료를 찾지 못했습니다. 다시 시도해주세요."
          );
        }
        cache.current.collection = collection;
      }

      let verification = cache.current.verification;
      if (!verification) {
        setState((s) => ({ ...s, statusText: "사실 확인하는 중..." }));
        verification = await callPipeline<VerificationReport>("/api/pipeline/3/verify", { groupId: opts.groupId });
        cache.current.verification = verification;
      }

      setState((s) => ({ ...s, statusText: "제약조건 확인하는 중..." }));
      const constraints = await callPipeline<ConstraintReport>("/api/pipeline/4/check", {
        groupId: opts.groupId,
        isSponsoredContent: opts.isSponsoredContent,
      });
      if (constraints.hasBlockingIssue && !skipWarningCheck) {
        setState({ running: false, statusText: "", error: "", blockingWarning: constraints });
        return;
      }

      // 광고 사례는 참고 자료일 뿐이라 실패해도 전체를 멈추지 않는다.
      setState((s) => ({ ...s, statusText: "참고할 광고 사례 찾는 중...", blockingWarning: null }));
      let adReferences: AdReferenceReport | undefined;
      try {
        adReferences = await callPipeline<AdReferenceReport>("/api/pipeline/5/ad-references", {
          topic: opts.topic || `${opts.groupLabel} 정부 지원 정책`,
          platformId: opts.platformId,
        });
      } catch {
        adReferences = undefined;
      }

      setState((s) => ({ ...s, statusText: "후킹 문구 만드는 중..." }));
      const hookSeo = await callPipeline<HookSeoReport>("/api/pipeline/5/hook-seo", {
        groupId: opts.groupId,
        platforms: [opts.platformId],
        adReferences,
      });

      setState((s) => ({ ...s, statusText: "대본 정리하는 중..." }));
      const script = await callPipeline<ScriptResult>("/api/pipeline/6/script", {
        groupId: opts.groupId,
        platformId: opts.platformId,
        chosenHook: hookSeo.platforms[0]?.hooks[0],
      });

      // AI에게 다시 쓰게 하지 않고, 검증을 통과한 항목을 그대로 카드로 옮긴다.
      const { hookHeadline, cards } = buildCardsAndHook(collection, verification, hookSeo, script.title);

      updateProject((prev) => ({
        ...prev,
        groupId: opts.groupId,
        groupLabel: opts.groupLabel,
        platformId: opts.platformId,
        topic: opts.topic,
        isSponsoredContent: opts.isSponsoredContent,
        collection,
        verification,
        constraints,
        adReferences,
        hookSeo,
        hashtags: hookSeo.platforms[0]?.hashtags ?? [],
        script,
        hookHeadline,
        cards,
      }));
      setState({ running: false, statusText: "", error: "", blockingWarning: null });
    } catch (e: any) {
      setState({ running: false, statusText: "", error: e?.message || "만드는 중 오류가 발생했습니다.", blockingWarning: null });
    }
  }

  return { ...state, run, reset };
}
