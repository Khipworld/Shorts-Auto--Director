import { useState } from "react";
import { callPipeline } from "./api";
import type { ProjectState } from "./App";
import type {
  CollectionResult,
  ProsConsReport,
  VerificationReport,
  ConstraintReport,
  HookSeoReport,
  ScriptResult,
  SubtitleLine,
} from "./types";

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onBackToStart: () => void;
  onGoToOutput: () => void;
}

export default function EditorScreen({ project, updateProject, onBackToStart, onGoToOutput }: Props) {
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 함수형 업데이트를 써야 안전함 — 비동기 핸들러 안에서 project를 그대로 클로저로 스프레드하면,
  // 같은 렌더에서 캡처된 오래된 project를 기준으로 두 번째 update()가 첫 번째 update()의 변경을
  // 덮어써버리는 문제가 있었음(실제로 [6]대본 생성에서 겪음 — script/narration이 사라짐).
  function update(patch: Partial<ProjectState>) {
    updateProject((prev) => ({ ...prev, ...patch }));
  }
  function setErr(stage: string, msg: string) {
    setErrors((e) => ({ ...e, [stage]: msg }));
  }

  async function run(stage: string, fn: () => Promise<void>) {
    setLoadingStage(stage);
    setErr(stage, "");
    try {
      await fn();
    } catch (e: any) {
      setErr(stage, e.message || "실행에 실패했습니다.");
    } finally {
      setLoadingStage(null);
    }
  }

  const runCollect = () =>
    run("1", async () => {
      const d = await callPipeline<CollectionResult>("/api/pipeline/1/collect", { groupId: project.groupId });
      update({ collection: d });
    });

  const runProsCons = () =>
    run("2", async () => {
      const d = await callPipeline<ProsConsReport>("/api/pipeline/2/analyze", { groupId: project.groupId });
      update({ prosCons: d });
    });

  const runVerify = () =>
    run("3", async () => {
      const d = await callPipeline<VerificationReport>("/api/pipeline/3/verify", { groupId: project.groupId });
      update({ verification: d });
    });

  const runConstraints = () =>
    run("4", async () => {
      const d = await callPipeline<ConstraintReport>("/api/pipeline/4/check", {
        groupId: project.groupId,
        isSponsoredContent: project.isSponsoredContent,
      });
      update({ constraints: d });
    });

  const runHookSeo = () =>
    run("5", async () => {
      const d = await callPipeline<HookSeoReport>("/api/pipeline/5/hook-seo", { groupId: project.groupId, platforms: [project.platformId] });
      update({ hookSeo: d, hashtags: d.platforms[0]?.hashtags ?? [], chosenHookIndex: 0 });
    });

  const runScript = () =>
    run("6", async () => {
      const chosenHook = project.hookSeo?.platforms[0]?.hooks[project.chosenHookIndex];
      const d = await callPipeline<ScriptResult>("/api/pipeline/6/script", {
        groupId: project.groupId,
        platformId: project.platformId,
        chosenHook,
      });
      // 대본이 나오면 곧바로 자막도 한 번 만들어둠 (사용자가 편집 후 다시 나눌 수 있음).
      // update()를 두 번 나눠 부르면 둘 다 같은(오래된) project를 기준으로 스프레드해서
      // 먼저 부른 update의 내용이 나중 update에 덮여 사라지는 문제가 있어, 한 번에 합쳐서 반영.
      const subtitles = await fetchSubtitles(d.narration, d.estimatedDurationSec);
      update({ script: d, narration: d.narration, subtitles });
    });

  async function fetchSubtitles(narration: string, durationSec: number): Promise<SubtitleLine[]> {
    const d = await callPipeline<{ subtitles: SubtitleLine[] }>("/api/subtitles/split", { narration, duration: durationSec, startTime: 0 });
    return d.subtitles;
  }

  const runResplit = () =>
    run("7", async () => {
      const duration = project.script?.estimatedDurationSec ?? Math.round(project.narration.length / 4.5);
      const subtitles = await fetchSubtitles(project.narration, duration);
      update({ subtitles });
    });

  const removeHashtag = (tag: string) => update({ hashtags: project.hashtags.filter((h) => h !== tag) });
  const updateSubtitleText = (idx: number, text: string) => {
    const next = [...project.subtitles];
    next[idx] = { ...next[idx], text };
    update({ subtitles: next });
  };

  return (
    <div>
      <div className="top-nav">
        <div>
          <h1>{project.groupLabel} 쇼츠 — 편집</h1>
          <div className="sub">각 단계 결과를 확인하고 필요하면 직접 고친 뒤, 마지막에 출력물을 만드세요.</div>
        </div>
        <button className="ghost" onClick={onBackToStart}>← 새로 시작</button>
      </div>

      {/* [1] 자료 수집 */}
      <div className="card">
        <div className="card-head">
          <div className="card-head-left"><h2>[1] 자료 수집</h2></div>
          <button onClick={runCollect} disabled={loadingStage === "1"}>{project.collection ? "다시 수집" : "실행"}</button>
        </div>
        {loadingStage === "1" && <div className="loading">웹검색으로 자료를 모으는 중...</div>}
        {errors["1"] && <div className="error">{errors["1"]}</div>}
        {!project.collection && !loadingStage && <div className="empty">아직 실행 안 함</div>}
        {project.collection && (
          <>
            <div className="item-meta">
              출처 {project.collection.distinctSourceCount}개
              {project.collection.belowMinimumSources && <span className="badge warning" style={{ marginLeft: 6 }}>최소기준 미달</span>}
            </div>
            {project.collection.sources.map((s, i) => (
              <div className="item" key={i}>
                <div className="item-title">
                  {s.title}
                  <span className={`badge ${s.novelty}`}>{s.novelty}</span>
                  <span className={`badge ${s.trustTier}`}>{s.trustLabel}</span>
                </div>
                <div>{s.summary}</div>
                <div className="item-meta"><a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.sourceUrl}</a></div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* [2] 장단점 분석 */}
      <div className="card">
        <div className="card-head">
          <h2>[2] 장단점 분석</h2>
          <button onClick={runProsCons} disabled={loadingStage === "2" || !project.collection}>{project.prosCons ? "다시 분석" : "실행"}</button>
        </div>
        {loadingStage === "2" && <div className="loading">분석 중...</div>}
        {errors["2"] && <div className="error">{errors["2"]}</div>}
        {!project.collection && <div className="empty">[1]자료 수집을 먼저 실행하세요</div>}
        {project.prosCons && (
          <>
            <div className="item-meta" style={{ marginBottom: 8 }}><b>종합 의견:</b> {project.prosCons.overallRecommendation}</div>
            {project.prosCons.items.map((it, i) => (
              <div className="item" key={i}>
                <div className="item-title">{it.title}</div>
                <div>👍 {it.pros.join(" · ") || "-"}</div>
                <div>👎 {it.cons.join(" · ") || "없음"}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* [3] 검증 */}
      <div className="card">
        <div className="card-head">
          <h2>[3] 사실/신뢰성 검증</h2>
          <button onClick={runVerify} disabled={loadingStage === "3" || !project.collection}>{project.verification ? "다시 검증" : "실행"}</button>
        </div>
        {loadingStage === "3" && <div className="loading">교차 확인 중...</div>}
        {errors["3"] && <div className="error">{errors["3"]}</div>}
        {!project.collection && <div className="empty">[1]자료 수집을 먼저 실행하세요</div>}
        {project.verification && project.verification.results.map((r, i) => (
          <div className="item" key={i}>
            <div className="item-title">{r.title} <span className={`badge ${r.finalStatus}`}>{r.finalStatus}</span></div>
            {r.decisionLog.map((l, j) => <div className="log-line" key={j}>· {l}</div>)}
          </div>
        ))}
      </div>

      {/* [4] 제약조건 */}
      <div className="card">
        <div className="card-head">
          <h2>[4] 제약조건 파악</h2>
          <button onClick={runConstraints} disabled={loadingStage === "4" || !project.collection}>{project.constraints ? "다시 확인" : "실행"}</button>
        </div>
        <label className="item-meta" style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={!!project.isSponsoredContent}
            onChange={(e) => update({ isSponsoredContent: e.target.checked })}
          /> 이 콘텐츠는 정부/기관의 지원(협찬)을 받아 제작됨
        </label>
        {loadingStage === "4" && <div className="loading">확인 중...</div>}
        {errors["4"] && <div className="error">{errors["4"]}</div>}
        {project.constraints && project.constraints.checks.map((c, i) => (
          <div className="item" key={i}>
            <div className="item-title">{c.label} <span className={`badge ${c.status}`}>{c.status}</span></div>
            <div>{c.detail}</div>
          </div>
        ))}
      </div>

      {/* [5] 후킹/SEO */}
      <div className="card">
        <div className="card-head">
          <h2>[5] 후킹·SEO 분석</h2>
          <button onClick={runHookSeo} disabled={loadingStage === "5" || !project.collection}>{project.hookSeo ? "다시 생성" : "실행"}</button>
        </div>
        {loadingStage === "5" && <div className="loading">생성 중...</div>}
        {errors["5"] && <div className="error">{errors["5"]}</div>}
        {project.hookSeo && (
          <>
            <div className="item-meta" style={{ marginBottom: 6 }}>제외된 미검증 항목: {project.hookSeo.excludedUnverifiedCount}개 — 후킹 문구 중 하나를 골라 [6]대본의 첫 문장으로 쓰세요</div>
            {project.hookSeo.platforms[0]?.hooks.map((h, i) => (
              <label className="hook-option" key={i}>
                <input type="radio" checked={project.chosenHookIndex === i} onChange={() => update({ chosenHookIndex: i })} />
                {h}
              </label>
            ))}
            <div className="item-meta" style={{ marginTop: 8 }}>해시태그 (클릭해서 제거 가능)</div>
            <div className="chips">
              {project.hashtags.map((tag) => (
                <span className="chip" key={tag}>{tag} <button onClick={() => removeHashtag(tag)}>×</button></span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* [6]/[7] 대본 + 자막 */}
      <div className="card">
        <div className="card-head">
          <h2>[6] 대본 생성</h2>
          <button onClick={runScript} disabled={loadingStage === "6" || !project.collection}>{project.script ? "다시 생성" : "실행"}</button>
        </div>
        {loadingStage === "6" && <div className="loading">대본 작성 중...</div>}
        {errors["6"] && <div className="error">{errors["6"]}</div>}
        {project.script && (
          <>
            <div className="item-title">{project.script.title}</div>
            <textarea
              rows={5}
              value={project.narration}
              onChange={(e) => update({ narration: e.target.value })}
            />
            <div className="item-meta" style={{ marginTop: 6 }}>
              예상 길이: 약 {Math.round(project.narration.length / 4.5)}초
              {project.script.unverifiedLeakCheck.leaked && (
                <span className="badge warning" style={{ marginLeft: 6 }}>미검증 내용 감지: {project.script.unverifiedLeakCheck.matches.join(", ")}</span>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <button onClick={runResplit} disabled={loadingStage === "7"}>{loadingStage === "7" ? "자막 나누는 중..." : "자막 재분할"}</button>
            </div>
            {project.subtitles.length > 0 && (
              <table className="subs-table">
                <tbody>
                  {project.subtitles.map((s, i) => (
                    <tr key={i}>
                      <td className="time-cell">{s.start} ~ {s.end}</td>
                      <td><input type="text" value={s.text} onChange={(e) => updateSubtitleText(i, e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        <button className="primary" disabled={!project.script} onClick={onGoToOutput}>출력물 만들기 →</button>
      </div>
    </div>
  );
}
