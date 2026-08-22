import { useState } from "react";
import type { ProjectState } from "./App";

function buildDescription(project: ProjectState, chosenHook: string): string {
  const sources = project.script?.sourceUrlsUsed ?? [];
  const sourcesLine = sources.length > 3 ? `${sources.slice(0, 3).join(", ")} 외 ${sources.length - 3}건` : sources.join(", ");
  return [
    project.script?.title ?? "",
    "",
    chosenHook,
    "",
    project.hashtags.join(" "),
    "",
    `※ 본 영상은 다음 출처를 참고해 제작되었습니다: ${sourcesLine}`,
  ].join("\n");
}

export default function OutputScreen({ project, onBack }: { project: ProjectState; onBack: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!project.script) return null;

  const chosenHook = project.hookSeo?.platforms[0]?.hooks[project.chosenHookIndex] ?? "";
  const description = buildDescription(project, chosenHook);
  const durationSec = Math.round(project.narration.length / 4.5);

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div>
      <div className="top-nav">
        <div>
          <h1>{project.groupLabel} — 출력물</h1>
          <div className="sub">[6]대본/자막 화면에서 고친 내용이 그대로 반영됩니다. 복사해서 실제 업로드에 사용하세요.</div>
        </div>
        <button className="ghost" onClick={onBack}>← 편집으로 돌아가기</button>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>제목</h2>
          <button className="ghost" onClick={() => copy("title", project.script!.title)}>{copied === "title" ? "복사됨!" : "복사"}</button>
        </div>
        <div className="item-title">{project.script.title}</div>
        <div className="item-meta">화면비 9:16 · 예상 길이 약 {durationSec}초</div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>설명(description)</h2>
          <button className="ghost" onClick={() => copy("desc", description)}>{copied === "desc" ? "복사됨!" : "복사"}</button>
        </div>
        <textarea rows={7} readOnly value={description} />
      </div>

      <div className="card">
        <div className="card-head"><h2>해시태그</h2></div>
        <div className="chips">{project.hashtags.map((t) => <span className="chip" key={t}>{t}</span>)}</div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>나레이션</h2>
          <button className="ghost" onClick={() => copy("narration", project.narration)}>{copied === "narration" ? "복사됨!" : "복사"}</button>
        </div>
        <textarea rows={5} readOnly value={project.narration} />
      </div>

      <div className="card">
        <div className="card-head"><h2>자막 ({project.subtitles.length}줄)</h2></div>
        <table className="subs-table">
          <tbody>
            {project.subtitles.map((s, i) => (
              <tr key={i}><td className="time-cell">{s.start} ~ {s.end}</td><td>{s.text}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
