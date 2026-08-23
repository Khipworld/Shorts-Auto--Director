import { useRef, useState } from "react";
import { callPipeline, getJson } from "./api";
import { getCardTheme } from "./cardTheme";
import { cardsToNarration } from "./buildCards";
import { VOICE_PRESETS, BGM_PRESETS, SFX_PRESETS, VIDEO_FORMATS, getFormat } from "./studioOptions";
import { buildTimedLines, formatTimecode, totalEstimatedSeconds, SEGMENT_LABEL, OPTIMAL_MAX_SECONDS, OPTIMAL_MIN_SECONDS } from "./subtitleTiming";
import type { ProjectState, CardItem, AudioSettings, SubtitleLayout } from "./App";
import type { SubtitleLine } from "./types";

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onStartOver: () => void;
  onRegenerate: () => void; // 지금 주제로 자료수집부터 다시 실행
}

// 쇼츠 스튜디오 — design/main-screen-mockup.html에서 확정한 화면 구성을 그대로 옮긴 것.
// 좌(음성·오디오) / 중앙(미리보기) / 우(플랫폼·자막 위치) 3단 패널 + 하단 자막 편집기.
//
// 자막 편집기는 K-Street의 쇼츠 출력 화면(OutputModals.tsx) 패턴 — 줄마다 타임코드를
// 보여주고 바로 옆에서 텍스트를 고칠 수 있게 한다. 다만 K-Street와 달리 이 프로젝트의
// 자막은 카드뉴스 구조라 한 줄이 "제목 + 핵심 수치" 두 조각으로 되어 있어서, 한 줄 안에
// 두 입력칸을 둔다(그래야 미리보기의 카드 레이아웃이 유지됨).
//
// 아직 백엔드가 없는 항목(BGM/SFX/자막 위치)은 화면에서 지우지 않고 "준비중" 배지로
// 명확히 표시한다 — 실제로 동작하는 것과 아닌 것을 구분해서 보여주기 위함.
export default function ResultScreen({ project, updateProject, onStartOver, onRegenerate }: Props) {
  const theme = getCardTheme(project.groupId);
  const [selected, setSelected] = useState(0); // 0 = 후킹, 1.. = cards[i-1]
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const bgmFileRef = useRef<HTMLInputElement>(null);

  const videoUrl = project.videoJobId ? `/api/video/download/${project.videoJobId}` : "";
  const timedLines = buildTimedLines(project.hookHeadline, project.cards, project.audio.speechSpeed);
  const totalSeconds = totalEstimatedSeconds(timedLines);
  const format = getFormat(project.formatId);

  function update(patch: Partial<ProjectState>) {
    updateProject((prev) => ({ ...prev, ...patch }));
  }
  function updateAudio(patch: Partial<AudioSettings>) {
    updateProject((prev) => ({ ...prev, audio: { ...prev.audio, ...patch } }));
  }
  function updateLayout(patch: Partial<SubtitleLayout>) {
    updateProject((prev) => ({ ...prev, subtitleLayout: { ...prev.subtitleLayout, ...patch } }));
  }
  function updateCard(idx: number, patch: Partial<CardItem>) {
    updateProject((prev) => {
      const next = [...prev.cards];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, cards: next };
    });
  }
  function removeCard(idx: number) {
    updateProject((prev) => ({
      ...prev,
      cards: prev.cards.filter((_, i) => i !== idx).map((c, i) => ({ ...c, badge: String(i + 1).padStart(2, "0") })),
    }));
    if (selected > project.cards.length - 1) setSelected(Math.max(0, project.cards.length - 1));
  }

  async function renderVideo() {
    setRendering(true);
    setError("");
    setProgress(0);
    try {
      const narration = cardsToNarration(project.hookHeadline, project.cards);
      const subtitles: SubtitleLine[] = timedLines.map((l) => ({ start: "00:00", end: "00:00", text: l.text }));

      // 참고 영상(01_임신부_후킹결합.mp4)과 같은 카드뉴스 구성으로 만든다:
      // 후킹 → 번호 카드들 → CTA. 미리보기에 보이는 것과 같은 장면이 그대로 영상이 된다.
      const slides = [
        { kind: "hook" as const, badge: `${project.groupLabel} 지원`, headline: project.hookHeadline },
        ...project.cards.map((c) => ({ kind: "card" as const, number: c.badge, title: c.title, detail: c.detail })),
        {
          kind: "cta" as const,
          badge: `${project.groupLabel} 지원`,
          headline: "내 지원금 지금 확인하세요",
          buttonText: "프로필 링크에서 확인",
          footnote: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 기준`,
        },
      ].filter((s) => (s.kind === "card" ? s.title.trim() : s.headline.trim()));

      const { jobId } = await callPipeline<{ jobId: string }>("/api/video/render", {
        title: project.topic || project.script?.title || project.hookHeadline,
        groupLabel: project.groupLabel,
        aspectRatio: format.ratio,
        voicePreset: project.audio.voicePreset,
        speechSpeed: project.audio.speechSpeed,
        subtitleLayout: project.subtitleLayout,
        bannerText: `${project.groupLabel} 지원정책 안내`,
        slideTheme: { gradientFrom: theme.gradientFrom, gradientTo: theme.gradientTo, accent: theme.accent },
        slides,
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
          <h1>{project.groupLabel} 쇼츠 스튜디오</h1>
          <div className="sub" style={{ marginBottom: 0 }}>
            슬라이드를 고르고 문구·음성·자막 위치를 조정한 뒤 영상을 만드세요.
          </div>
        </div>
        <button className="ghost" onClick={onStartOver}>← 새로 시작</button>
      </div>

      {/* 주제 입력란 — 목업(design/main-screen-mockup.html) 맨 위에 있던 칸.
          여기서 고친 주제는 영상 제목에 바로 반영되고, "자료 다시 찾기"를 누르면
          그 주제로 자료수집부터 다시 돌린다. */}
      <div className="card topic-bar">
        <div className="field-label" style={{ marginBottom: 8 }}>
          📝 주제 <span className="pill pill-live">영상 제목에 반영됨</span>
        </div>
        <div className="topic-row">
          <input
            type="text"
            value={project.topic}
            placeholder={`예: 2026년 ${project.groupLabel} 지원 정책 총정리`}
            onChange={(e) => update({ topic: e.target.value })}
          />
          <button onClick={() => onRegenerate()} disabled={rendering}>
            이 주제로 자료 다시 찾기
          </button>
        </div>
        <div className="item-meta" style={{ marginTop: 6 }}>
          주제만 고치면 영상 제목이 바뀝니다. 카드 내용까지 새 주제에 맞게 바꾸려면
          "자료 다시 찾기"를 누르세요 — 자료수집부터 다시 돌아가며 지금 편집한 내용은 사라집니다.
        </div>
      </div>

      <div className="studio-grid">
        {/* ── 좌: 음성 & 오디오 ── */}
        <div className="card panel">
          <div className="card-head"><h2>🎙 음성 &amp; 오디오</h2></div>

          <div className="field-group">
            <div className="field-label">TTS 성우 <span className="pill pill-live">영상에 반영됨</span></div>
            <select value={project.audio.voicePreset} onChange={(e) => updateAudio({ voicePreset: e.target.value })}>
              {VOICE_PRESETS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <button disabled title="성우 미리듣기는 아직 없습니다 — 영상을 만들면 실제 음성을 확인할 수 있습니다." style={{ width: "100%", marginTop: 6 }}>
              ▶ 샘플 재생 (준비중)
            </button>
          </div>

          <div className="field-group">
            <div className="field-label">
              말하기 속도 <span className="pill pill-live">영상 길이에 반영됨</span>
            </div>
            <SliderRow
              left="느리게" right="빠르게"
              min={80} max={180}
              value={Math.round(project.audio.speechSpeed * 100)}
              onChange={(v) => updateAudio({ speechSpeed: v / 100 })}
            />
            <div className="item-meta">
              현재 {project.audio.speechSpeed.toFixed(2)}배. 성우가 느리게 읽어서 기본값을 1.4로
              두었습니다 — 낮추면 영상이 길어집니다.
            </div>
          </div>

          <div className="field-group">
            <div className="field-label">BGM 프리셋 <span className="pill pill-todo">준비중</span></div>
            <select value={project.audio.bgmPreset} onChange={(e) => updateAudio({ bgmPreset: e.target.value })}>
              {BGM_PRESETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <VolumeSlider value={project.audio.bgmVolume} onChange={(v) => updateAudio({ bgmVolume: v })} />
          </div>

          <div className="field-group">
            <div className="field-label">내 음원 파일 <span className="pill pill-todo">준비중</span></div>
            <button style={{ width: "100%" }} onClick={() => bgmFileRef.current?.click()}>📁 내 음원 파일 추가</button>
            <input
              ref={bgmFileRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => updateAudio({ customBgmName: e.target.files?.[0]?.name ?? "" })}
            />
            {project.audio.customBgmName && (
              <div className="file-chip">
                🎵 {project.audio.customBgmName}
                <button className="ghost" style={{ padding: 0 }} onClick={() => updateAudio({ customBgmName: "" })}>✕</button>
              </div>
            )}
            <VolumeSlider value={project.audio.customBgmVolume} onChange={(v) => updateAudio({ customBgmVolume: v })} />
          </div>

          <div className="field-group">
            <div className="field-label">SFX 전환 효과음 <span className="pill pill-todo">준비중</span></div>
            <select value={project.audio.sfxPreset} onChange={(e) => updateAudio({ sfxPreset: e.target.value })}>
              {SFX_PRESETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <VolumeSlider value={project.audio.sfxVolume} onChange={(v) => updateAudio({ sfxVolume: v })} />
          </div>

          <div className="item-meta">
            "준비중"은 화면에서 고를 수는 있지만 아직 실제 영상에는 들어가지 않는 항목입니다
            (음원 파일과 믹싱 기능이 아직 없습니다).
          </div>
        </div>

        {/* ── 중앙: 미리보기 ── */}
        <div className="studio-center">
          <SlidePreview
            theme={theme}
            groupLabel={project.groupLabel}
            hookHeadline={project.hookHeadline}
            cards={project.cards}
            selected={selected}
            layout={project.subtitleLayout}
            ratio={format.ratio}
          />
          <div className="chips" style={{ marginTop: 10, justifyContent: "center" }}>
            <button className={selected === 0 ? "primary" : ""} onClick={() => setSelected(0)} style={{ padding: "4px 10px", fontSize: 12 }}>후킹</button>
            {project.cards.map((c, i) => (
              <button key={i} className={selected === i + 1 ? "primary" : ""} onClick={() => setSelected(i + 1)} style={{ padding: "4px 10px", fontSize: 12 }}>{c.badge}</button>
            ))}
          </div>
          <div className="scrubber-row">
            <span>▶</span>
            <div className="scrubber-track">
              <div
                className="scrubber-fill"
                style={{ width: timedLines.length ? `${((selected + 1) / timedLines.length) * 100}%` : "0%" }}
              />
            </div>
            <span className="time">예상 {formatTimecode(totalSeconds)}</span>
          </div>
          <div className="item-meta" style={{ textAlign: "center" }}>재생 미리보기는 아직 없습니다 — 슬라이드를 눌러 한 장씩 확인하세요.</div>
        </div>

        {/* ── 우: 플랫폼 & 자막 위치 ── */}
        <div className="card panel">
          <div className="card-head"><h2>📱 플랫폼 &amp; 자막</h2></div>

          <div className="field-group">
            <div className="field-label">배포 규격 <span className="pill pill-live">영상에 반영됨</span></div>
            {VIDEO_FORMATS.map((f) => (
              <div
                key={f.id}
                className={`format-item${project.formatId === f.id ? " selected" : ""}${f.supported ? "" : " disabled"}`}
                onClick={() => f.supported && update({ formatId: f.id })}
              >
                <span>{f.label} <span className="ratio">{f.ratio}</span></span>
                {!f.supported && <span className="pill pill-todo">준비중</span>}
                {project.formatId === f.id && <span className="pill pill-live">선택됨</span>}
              </div>
            ))}
          </div>

          <div className="field-group">
            <div className="field-label">자막 위치 조정 <span className="pill pill-live">영상에 반영됨</span></div>
            <SliderRow
              left="▲ 위" right="아래 ▼"
              min={10} max={90}
              value={project.subtitleLayout.vertical}
              onChange={(v) => updateLayout({ vertical: v })}
            />
            <SliderRow
              left="◀ 왼쪽" right="오른쪽 ▶"
              min={0} max={100}
              value={project.subtitleLayout.horizontal}
              onChange={(v) => updateLayout({ horizontal: v })}
            />
            <SliderRow
              left="여백 좁게" right="넓게"
              min={2} max={20}
              value={project.subtitleLayout.margin}
              onChange={(v) => updateLayout({ margin: v })}
            />
            <div className="item-meta">
              위 미리보기와 실제 영상에 같은 계산식으로 적용됩니다. 글자가 길어도 화면 밖으로
              나가지 않게 자동으로 안쪽에 묶입니다.
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단: 자막 편집기 ── */}
      <div className="card">
        <div className="card-head">
          <h2>✏️ 자막 편집기</h2>
          <span className={`pill ${totalSeconds > OPTIMAL_MAX_SECONDS ? "pill-todo" : "pill-live"}`}>
            예상 총 길이 {formatTimecode(totalSeconds)}
          </span>
        </div>

        {totalSeconds > OPTIMAL_MAX_SECONDS && (
          <div className="notice">
            쇼츠 최적 길이({OPTIMAL_MIN_SECONDS}~{OPTIMAL_MAX_SECONDS}초)를 넘습니다 — 카드를 줄이거나 문구를 짧게 하면 끝까지 보는 비율이 올라갑니다.
          </div>
        )}

        {!timedLines.length && <div className="empty">자막으로 만들 내용이 없습니다.</div>}

        {timedLines.map((line, i) => {
          const isHook = line.cardIndex < 0;
          const card = isHook ? null : project.cards[line.cardIndex];
          const slideIndex = isHook ? 0 : line.cardIndex + 1;
          return (
            <div
              key={i}
              className={`sub-row${selected === slideIndex ? " active" : ""}`}
              onClick={() => setSelected(slideIndex)}
            >
              <div className="sub-time">
                <div className="tc">{formatTimecode(line.startSeconds)}–{formatTimecode(line.endSeconds)}</div>
                <span className={`seg-tag ${line.kind}`}>{SEGMENT_LABEL[line.kind]}</span>
              </div>
              <div className="sub-fields">
                {isHook ? (
                  <input
                    type="text"
                    value={project.hookHeadline}
                    placeholder="첫 화면에 굵게 나올 후킹 문구 (예: 나만 몰랐던 220만원?)"
                    onChange={(e) => update({ hookHeadline: e.target.value })}
                  />
                ) : card ? (
                  <>
                    <input
                      type="text"
                      value={card.title}
                      placeholder="카드 제목"
                      onChange={(e) => updateCard(line.cardIndex, { title: e.target.value })}
                    />
                    <input
                      type="text"
                      value={card.detail}
                      placeholder="핵심 수치 / 한 줄 설명"
                      onChange={(e) => updateCard(line.cardIndex, { detail: e.target.value })}
                    />
                  </>
                ) : null}
              </div>
              {!isHook && (
                <button className="ghost" onClick={(e) => { e.stopPropagation(); removeCard(line.cardIndex); }}>삭제</button>
              )}
            </div>
          );
        })}

        <div className="item-meta" style={{ marginTop: 10 }}>
          시간은 글자 수로 계산한 <b>예상치</b>입니다. 실제 타이밍은 영상을 만들 때 성우가 읽은 길이로 다시 계산됩니다.
        </div>
      </div>

      <div className="card">
        <button className="primary" onClick={renderVideo} disabled={rendering || !timedLines.length} style={{ width: "100%" }}>
          {rendering ? `영상 만드는 중... ${progress}%` : videoUrl ? "이 내용으로 다시 만들기" : "이 내용으로 영상 만들기"}
        </button>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      {videoUrl && (
        <div className="card">
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

      <AdReferencePanel report={project.adReferences} />
    </div>
  );
}

// 후킹 문구가 무엇을 근거로 만들어졌는지 사용자가 직접 검토하는 패널.
// 요구서의 "검증 투명성 — 형식적 통과 표시 금지" 원칙을 이 단계에도 적용한 것:
// 사례를 못 찾았으면 못 찾았다고 그대로 보여준다.
function AdReferencePanel({ report }: { report?: ProjectState["adReferences"] }) {
  const [open, setOpen] = useState(false);

  if (!report) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>📺 참고한 광고 사례</h2>
          <span className="pill pill-todo">사례 없이 생성됨</span>
        </div>
        <div className="item-meta">
          이번 후킹 문구는 실제 광고 사례를 참고하지 않고 만들어졌습니다(사례 수집을 건너뛰었거나 실패).
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>📺 참고한 광고 사례</h2>
        <span className={`pill ${report.references.length ? "pill-live" : "pill-todo"}`}>
          사례 {report.references.length}건 · 패턴 {report.patterns.length}개
        </span>
      </div>

      {report.patterns.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {report.patterns.map((p, i) => (
            <div className="item" key={i}>
              <div className="item-title">{p.pattern}</div>
              <div style={{ fontSize: 13 }}>{p.applyToTopic}</div>
              <div className="item-meta">근거 사례: {p.evidence.join(", ")}</div>
            </div>
          ))}
        </div>
      )}

      {report.limitations.length > 0 && (
        <div className="notice">
          {report.limitations.map((l, i) => <div key={i}>· {l}</div>)}
        </div>
      )}

      {report.references.length > 0 && (
        <>
          <button className="ghost" style={{ paddingLeft: 0 }} onClick={() => setOpen((v) => !v)}>
            {open ? "▾ 사례 원문 접기" : `▸ 사례 ${report.references.length}건 자세히 보기`}
          </button>
          {open && report.references.map((r, i) => (
            <div className="item" key={i}>
              <div className="item-title">
                <span className="badge unchanged">{r.platform || "플랫폼 미상"}</span>
                <a href={r.sourceUrl} target="_blank" rel="noreferrer">{r.title}</a>
              </div>
              {r.hookText && <div style={{ fontSize: 13 }}><b>후킹:</b> {r.hookText}</div>}
              {r.structure && <div style={{ fontSize: 13 }}><b>구성:</b> {r.structure}</div>}
              {r.whyItWorked && <div style={{ fontSize: 13 }}><b>효과 이유:</b> {r.whyItWorked}</div>}
              <div className="item-meta">{r.metrics ? `수치: ${r.metrics}` : "수치 확인 안 됨"}</div>
            </div>
          ))}
        </>
      )}

      {!report.references.length && (
        <div className="item-meta">
          이 주제로 참고할 만한 광고 사례를 찾지 못했습니다. 후킹 문구는 사례 근거 없이 만들어졌습니다.
        </div>
      )}
    </div>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <SliderRow left="0%" right="100%" min={0} max={100} value={value} onChange={onChange} />;
}

function SliderRow({
  left, right, min, max, value, onChange,
}: {
  left: string; right: string; min: number; max: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <span>{left}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span>{right}</span>
    </div>
  );
}

function SlidePreview({
  theme, groupLabel, hookHeadline, cards, selected, layout, ratio,
}: {
  theme: ReturnType<typeof getCardTheme>;
  groupLabel: string;
  hookHeadline: string;
  cards: CardItem[];
  selected: number;
  layout: SubtitleLayout;
  ratio: string;
}) {
  const card = selected > 0 ? cards[selected - 1] : null;
  const total = 1 + cards.length;
  const progressPct = total > 0 ? ((selected + 1) / total) * 100 : 0;

  // 자막 상자의 폭은 여백 슬라이더로 정하고, 남는 폭 안에서만 좌우로 움직이게 한다 —
  // 이렇게 하면 좌우 슬라이더를 끝까지 밀어도 상자가 화면 밖으로 나가지 않는다.
  const boxWidthPct = 100 - layout.margin * 2;
  const travelPct = 100 - boxWidthPct;
  const leftPct = travelPct * (layout.horizontal / 100);

  const blockStyle: React.CSSProperties = {
    position: "absolute",
    left: `${leftPct}%`,
    width: `${boxWidthPct}%`,
    top: `${layout.vertical}%`,
    transform: "translateY(-50%)",
  };

  return (
    <div
      className="phone-frame"
      style={{
        aspectRatio: ratio.replace(":", " / "),
        background: `linear-gradient(160deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
      }}
    >
      <div className="phone-banner">{groupLabel} 지원정책 안내</div>

      {!card ? (
        <div style={blockStyle}>
          <div className="hook-box">{hookHeadline || "후킹 문구를 입력하세요"}</div>
        </div>
      ) : (
        <div style={blockStyle}>
          <div className="card-badge">{card.badge}</div>
          <div className="news-card" style={{ background: theme.cardBg }}>
            <div className="news-card-title">{card.title}</div>
            <div className="news-card-detail" style={{ color: theme.accent }}>{card.detail}</div>
          </div>
        </div>
      )}

      <div className="phone-progress">
        <div className="phone-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
    </div>
  );
}
