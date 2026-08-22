import { useState } from "react";
import { callPipeline, getJson } from "./api";
import type { ProjectState } from "./App";
import type { SubtitleLine } from "./types";

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onStartOver: () => void;
}

function buildDescription(project: ProjectState): string {
  const chosenHook = project.hookSeo?.platforms[0]?.hooks[0] ?? "";
  const sources = project.script?.sourceUrlsUsed ?? [];
  const sourcesLine = sources.length > 3 ? `${sources.slice(0, 3).join(", ")} 외 ${sources.length - 3}건` : sources.join(", ");
  return [project.script?.title ?? "", "", chosenHook, "", project.hashtags.join(" "), "", `※ 본 영상은 다음 출처를 참고해 제작되었습니다: ${sourcesLine}`].join("\n");
}

// "결과물(영상)을 보고 수정·편집"하는 화면 — 나레이션 텍스트를 고치거나 자막 줄을 직접
// 고친 뒤 "다시 만들기"를 누르면 그 내용으로 영상을 재렌더링한다. 자동 업로드는 아직 없음
// (사용자 지시: "일단 수동 업로드, 추후 자동 업로드") — 지금은 다운로드까지만 제공.
export default function ResultScreen({ project, updateProject, onStartOver }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [resplitting, setResplitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const videoUrl = project.videoJobId ? `/api/video/download/${project.videoJobId}` : "";
  const description = buildDescription(project);

  function update(patch: Partial<ProjectState>) {
    updateProject((prev) => ({ ...prev, ...patch }));
  }
  function updateSubtitleText(idx: number, text: string) {
    const next = [...project.subtitles];
    next[idx] = { ...next[idx], text };
    update({ subtitles: next });
  }
  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function resplitSubtitles() {
    setResplitting(true);
    setError("");
    try {
      const duration = Math.round(project.narration.length / 4.5);
      const { subtitles } = await callPipeline<{ subtitles: SubtitleLine[] }>("/api/subtitles/split", {
        narration: project.narration,
        duration,
        startTime: 0,
      });
      update({ subtitles });
    } catch (e: any) {
      setError(e.message || "자막 재분할에 실패했습니다.");
    } finally {
      setResplitting(false);
    }
  }

  async function regenerateVideo() {
    setRegenerating(true);
    setError("");
    setProgress(0);
    try {
      const { jobId } = await callPipeline<{ jobId: string }>("/api/video/render", {
        title: project.script?.title,
        groupLabel: project.groupLabel,
        aspectRatio: "9:16",
        subtitles: project.subtitles,
      });
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const status = await getJson<{ status: string; progress: number; error?: string }>(`/api/video/render/${jobId}/status`);
            setProgress(status.progress);
            if (status.status === "done") {
              clearInterval(interval);
              resolve();
            } else if (status.status === "error") {
              clearInterval(interval);
              reject(new Error(status.error || "영상 렌더링에 실패했습니다."));
            }
          } catch (e: any) {
            clearInterval(interval);
            reject(e);
          }
        }, 3000);
      });
      update({ videoJobId: jobId });
    } catch (e: any) {
      setError(e.message || "영상 재생성에 실패했습니다.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div>
      <div className="top-nav">
        <div>
          <h1>{project.groupLabel} — 완성된 영상</h1>
          <div className="sub">아래에서 나레이션/자막을 고친 뒤 "다시 만들기"를 누르면 영상에 반영됩니다.</div>
        </div>
        <button className="ghost" onClick={onStartOver}>← 새로 시작</button>
      </div>

      <div className="card">
        <video key={videoUrl} src={videoUrl} controls style={{ width: "100%", maxWidth: 340, display: "block", margin: "0 auto", borderRadius: 8, background: "#000" }} />
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href={videoUrl} download={`${project.groupLabel}_shorts.mp4`}>
            <button className="primary">영상 다운로드 (직접 업로드용)</button>
          </a>
          <div className="item-meta" style={{ marginTop: 6 }}>자동 업로드는 아직 지원하지 않습니다 — 다운로드해서 플랫폼에 직접 올려주세요.</div>
        </div>
      </div>

      {(regenerating || error) && (
        <div className="card">
          {regenerating && <div className="loading">영상 다시 만드는 중... {progress}%</div>}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>나레이션 (직접 수정 가능)</h2></div>
        <textarea rows={5} value={project.narration} onChange={(e) => update({ narration: e.target.value })} />
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button onClick={resplitSubtitles} disabled={resplitting}>{resplitting ? "자막 나누는 중..." : "자막 재분할"}</button>
          <button className="primary" onClick={regenerateVideo} disabled={regenerating}>이 내용으로 영상 다시 만들기</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>자막 ({project.subtitles.length}줄, 직접 수정 가능)</h2></div>
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
      </div>

      <div className="card">
        <div className="card-head">
          <h2>제목 / 설명 / 해시태그 (업로드 시 붙여넣기용)</h2>
          <button className="ghost" onClick={() => copy("desc", `${project.script?.title ?? ""}\n\n${description}`)}>{copied === "desc" ? "복사됨!" : "복사"}</button>
        </div>
        <div className="item-title">{project.script?.title}</div>
        <textarea rows={6} readOnly value={description} />
        <div className="chips" style={{ marginTop: 8 }}>
          {project.hashtags.map((t) => <span className="chip" key={t}>{t}</span>)}
        </div>
      </div>
    </div>
  );
}
