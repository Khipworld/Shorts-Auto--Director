import { useState } from "react";
import { callPipeline, getJson } from "./api";
import { getCardTheme } from "./cardTheme";
import { cardsToNarration } from "./buildCards";
import type { ProjectState, CardItem } from "./App";
import type { SubtitleLine } from "./types";

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onStartOver: () => void;
}

// "카드 스튜디오" — Viralux 참고 영상과 비교해서 발견한 문제(추상적 AI 배경 이미지가 뭘
// 뜻하는지 알 수 없음, 나레이션 한 문단은 정보 전달력이 낮음)를 해결하기 위해 정부기관
// 카드뉴스 표준 포맷(그룹별 고정 색상 + 오프닝 후킹 + 번호/제목/핵심수치 카드)으로
// 재구성한 편집 화면. 슬라이드(오프닝 후킹 또는 카드 하나)를 골라 실시간으로 미리보고,
// 텍스트를 고친 뒤 "영상 만들기"로 실제 mp4를 렌더링한다.
export default function ResultScreen({ project, updateProject, onStartOver }: Props) {
  const theme = getCardTheme(project.groupId);
  const [selected, setSelected] = useState(0); // 0 = 후킹, 1.. = cards[i-1]
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const videoUrl = project.videoJobId ? `/api/video/download/${project.videoJobId}` : "";
  const slideCount = 1 + project.cards.length;

  function update(patch: Partial<ProjectState>) {
    updateProject((prev) => ({ ...prev, ...patch }));
  }
  function updateCard(idx: number, patch: Partial<CardItem>) {
    const next = [...project.cards];
    next[idx] = { ...next[idx], ...patch };
    update({ cards: next });
  }
  function removeCard(idx: number) {
    const next = project.cards.filter((_, i) => i !== idx).map((c, i) => ({ ...c, badge: String(i + 1).padStart(2, "0") }));
    update({ cards: next });
    if (selected > next.length) setSelected(next.length);
  }

  async function renderVideo() {
    setRendering(true);
    setError("");
    setProgress(0);
    try {
      const narration = cardsToNarration(project.hookHeadline, project.cards);
      const subtitles: SubtitleLine[] = [
        { start: "00:00", end: "00:00", text: project.hookHeadline },
        ...project.cards.map((c) => ({ start: "00:00", end: "00:00", text: `${c.title}. ${c.detail}` })),
      ].filter((s) => s.text.trim());

      const { jobId } = await callPipeline<{ jobId: string }>("/api/video/render", {
        title: project.script?.title || project.hookHeadline,
        groupLabel: project.groupLabel,
        aspectRatio: "9:16",
        subtitles,
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

      update({ videoJobId: jobId, narration });
    } catch (e: any) {
      setError(e.message || "영상 만들기에 실패했습니다.");
    } finally {
      setRendering(false);
    }
  }

  return (
    <div>
      <div className="top-nav">
        <div>
          <h1>{project.groupLabel} — 카드 스튜디오</h1>
          <div className="sub">슬라이드를 골라 문구를 고친 뒤 영상을 만드세요. 정부기관 카드뉴스 포맷(오프닝 후킹 + 번호 카드)을 따릅니다.</div>
        </div>
        <button className="ghost" onClick={onStartOver}>← 새로 시작</button>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* 실시간 미리보기 */}
        <div style={{ flex: "0 0 260px" }}>
          <SlidePreview theme={theme} groupLabel={project.groupLabel} hookHeadline={project.hookHeadline} cards={project.cards} selected={selected} />
          <div className="chips" style={{ marginTop: 10, justifyContent: "center" }}>
            <button className={selected === 0 ? "primary" : ""} onClick={() => setSelected(0)} style={{ padding: "4px 10px", fontSize: 12 }}>후킹</button>
            {project.cards.map((c, i) => (
              <button key={i} className={selected === i + 1 ? "primary" : ""} onClick={() => setSelected(i + 1)} style={{ padding: "4px 10px", fontSize: 12 }}>{c.badge}</button>
            ))}
          </div>
        </div>

        {/* 편집 패널 */}
        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div className="card">
            {selected === 0 ? (
              <>
                <div className="card-head"><h2>오프닝 후킹 문구</h2></div>
                <textarea
                  rows={2}
                  value={project.hookHeadline}
                  onChange={(e) => update({ hookHeadline: e.target.value })}
                  placeholder="예: 나만 몰랐던 220만원?"
                />
                <div className="item-meta" style={{ marginTop: 6 }}>첫 화면에서 굵게 노출됩니다 — 짧고 구체적인 숫자/질문이 효과적입니다.</div>
              </>
            ) : (
              (() => {
                const idx = selected - 1;
                const c = project.cards[idx];
                if (!c) return null;
                return (
                  <>
                    <div className="card-head">
                      <h2>카드 {c.badge}</h2>
                      <button className="ghost" onClick={() => removeCard(idx)}>이 카드 삭제</button>
                    </div>
                    <label className="item-meta">제목</label>
                    <input type="text" value={c.title} onChange={(e) => updateCard(idx, { title: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
                    <label className="item-meta">핵심 수치 / 설명</label>
                    <textarea rows={3} value={c.detail} onChange={(e) => updateCard(idx, { detail: e.target.value })} />
                  </>
                );
              })()
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>전체 카드 목록 ({project.cards.length}개)</h2></div>
            {project.cards.map((c, i) => (
              <div className="item" key={i} style={{ cursor: "pointer" }} onClick={() => setSelected(i + 1)}>
                <div className="item-title"><span className="badge unchanged">{c.badge}</span>{c.title}</div>
              </div>
            ))}
            {!project.cards.length && <div className="empty">카드가 없습니다.</div>}
          </div>

          <div className="card">
            <button className="primary" onClick={renderVideo} disabled={rendering || !slideCount} style={{ width: "100%" }}>
              {rendering ? `영상 만드는 중... ${progress}%` : videoUrl ? "이 내용으로 다시 만들기" : "이 내용으로 영상 만들기"}
            </button>
            {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
          </div>
        </div>
      </div>

      {videoUrl && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head"><h2>완성된 영상</h2></div>
          <video key={videoUrl} src={videoUrl} controls style={{ width: "100%", maxWidth: 260, display: "block", margin: "0 auto", borderRadius: 8, background: "#000" }} />
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <a href={videoUrl} download={`${project.groupLabel}_shorts.mp4`}>
              <button className="primary">영상 다운로드 (직접 업로드용)</button>
            </a>
            <div className="item-meta" style={{ marginTop: 6 }}>자동 업로드는 아직 지원하지 않습니다 — 다운로드해서 플랫폼에 직접 올려주세요.</div>
          </div>
        </div>
      )}

      {project.hashtags.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>해시태그</h2></div>
          <div className="chips">{project.hashtags.map((t) => <span className="chip" key={t}>{t}</span>)}</div>
        </div>
      )}
    </div>
  );
}

function SlidePreview({
  theme,
  groupLabel,
  hookHeadline,
  cards,
  selected,
}: {
  theme: ReturnType<typeof getCardTheme>;
  groupLabel: string;
  hookHeadline: string;
  cards: CardItem[];
  selected: number;
}) {
  const card = selected > 0 ? cards[selected - 1] : null;
  const total = 1 + cards.length;
  const progressPct = total > 0 ? ((selected + 1) / total) * 100 : 0;

  return (
    <div
      style={{
        aspectRatio: "9 / 16",
        borderRadius: 14,
        overflow: "hidden",
        position: "relative",
        background: `linear-gradient(160deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      }}
    >
      {/* 상단 배너 */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.35)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          padding: "5px 14px",
          borderRadius: 100,
          whiteSpace: "nowrap",
        }}
      >
        {groupLabel} 지원정책 안내
      </div>

      {/* 본문: 후킹 or 카드 */}
      {!card ? (
        <div style={{ position: "absolute", left: 16, right: 16, top: "58%", transform: "translateY(-50%)" }}>
          <div
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 20,
              lineHeight: 1.35,
              padding: "18px 16px",
              borderRadius: 10,
              textAlign: "center",
            }}
          >
            {hookHeadline || "후킹 문구를 입력하세요"}
          </div>
        </div>
      ) : (
        <div style={{ position: "absolute", left: 16, right: 16, top: "50%", transform: "translateY(-50%)" }}>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>{card.badge}</div>
          <div
            style={{
              background: theme.cardBg,
              borderRadius: 12,
              padding: "18px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a1a", marginBottom: 8, lineHeight: 1.3 }}>{card.title}</div>
            <div style={{ fontSize: 12.5, color: theme.accent, fontWeight: 600, lineHeight: 1.4 }}>{card.detail}</div>
          </div>
        </div>
      )}

      {/* 하단 진행바 */}
      <div style={{ position: "absolute", bottom: 10, left: 16, right: 16, height: 3, background: "rgba(255,255,255,0.3)", borderRadius: 2 }}>
        <div style={{ width: `${progressPct}%`, height: "100%", background: "#fff", borderRadius: 2 }} />
      </div>
    </div>
  );
}
