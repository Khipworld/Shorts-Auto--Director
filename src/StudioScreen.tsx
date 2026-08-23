import { useEffect, useRef, useState } from "react";
import { callPipeline, getJson } from "./api";
import { getCardTheme } from "./cardTheme";
import { cardsToNarration } from "./buildCards";
import { VOICE_PRESETS, BGM_PRESETS, SFX_PRESETS, VIDEO_FORMATS, getFormat, TOPIC_EXAMPLES } from "./studioOptions";
import { buildTimedLines, formatTimecode, totalEstimatedSeconds, SEGMENT_LABEL, OPTIMAL_MAX_SECONDS, OPTIMAL_MIN_SECONDS } from "./subtitleTiming";
import { inferGroupFromTopic } from "./inferGroup";
import { usePipeline } from "./usePipeline";
import type { ProjectState, CardItem, AudioSettings, SubtitleLayout } from "./App";
import type { SubtitleLine, LifecycleGroup } from "./types";

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onReset: () => void;
}

// 쇼츠 스튜디오 — 이 프로그램의 유일한 화면.
// 좌(음성·오디오) / 중앙(미리보기) / 우(배포·자막 위치) 3단 패널 + 하단 자막 편집기,
// 그리고 맨 위에 주제 입력.
//
// 2026-08-23 구조 변경(사용자 지시): 시작 화면과 진행 화면을 없앴다. 대상 그룹은 주제에서
// 자동으로 알아내고, 배포 플랫폼은 오른쪽 배포 패널에 합쳤으며, 자료수집~카드뉴스 구성은
// 화면에 단계별로 표시하지 않고 한 줄 상태 표시만 남겼다.
//
// 자막 편집기는 K-Street의 쇼츠 출력 화면(OutputModals.tsx) 패턴 — 줄마다 타임코드를
// 보여주고 바로 옆에서 텍스트를 고칠 수 있게 한다. 다만 이 프로젝트의 자막은 카드뉴스
// 구조라 한 줄이 "제목 + 핵심 수치" 두 조각이라, 한 줄 안에 두 입력칸을 둔다.
//
// 아직 백엔드가 없는 항목(BGM/SFX)은 화면에서 지우지 않고 "준비중" 배지로 명확히 표시한다.
export default function StudioScreen({ project, updateProject, onReset }: Props) {
  const theme = getCardTheme(project.groupId);
  const [selected, setSelected] = useState(0); // 0 = 후킹, 1.. = cards[i-1]
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const bgmFileRef = useRef<HTMLInputElement>(null);

  const [groups, setGroups] = useState<LifecycleGroup[]>([]);
  const [manualGroupId, setManualGroupId] = useState(""); // 주제로 그룹을 못 알아냈을 때만 씀
  const pipeline = usePipeline(project, updateProject);

  useEffect(() => {
    getJson<{ groups: LifecycleGroup[] }>("/api/pipeline/1/groups")
      .then((d) => setGroups(d.groups))
      .catch(() => setGroups([]));
  }, []);

  const guess = inferGroupFromTopic(project.topic, groups);
  const resolvedGroupId = guess?.groupId || manualGroupId;
  const resolvedGroupLabel = guess?.groupLabel || groups.find((g) => g.id === manualGroupId)?.label || "";
  const hasContent = project.cards.length > 0 || project.hookHeadline.trim().length > 0;

  async function startPipeline(skipWarning = false) {
    if (!resolvedGroupId) return;
    await pipeline.run(
      {
        groupId: resolvedGroupId,
        groupLabel: resolvedGroupLabel,
        platformId: project.platformId,
        topic: project.topic.trim(),
        isSponsoredContent: project.isSponsoredContent === true,
      },
      skipWarning
    );
  }

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
        bgmTrack: project.audio.bgmPreset,
        bgmVolume: project.audio.bgmVolume,
        sfxTrack: project.audio.sfxPreset,
        sfxVolume: project.audio.sfxVolume,
        subtitleLayout: project.subtitleLayout,
        withIntro: project.withIntro,
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
          <h1>Shorts Auto Director</h1>
          <div className="sub" style={{ marginBottom: 0 }}>
            주제를 입력하면 자료를 찾아 카드뉴스 쇼츠를 만들어드립니다. 만든 뒤 여기서 바로 고칠 수 있어요.
          </div>
        </div>
        {hasContent && <button className="ghost" onClick={onReset}>← 처음부터</button>}
      </div>

      {/* 주제 입력 — 이 화면의 시작점. 대상 그룹은 주제에서 자동으로 알아낸다. */}
      <div className="card topic-bar">
        <div className="field-label" style={{ marginBottom: 8 }}>
          📝 어떤 주제로 만들까요?
          {resolvedGroupLabel && <span className="pill pill-live">{resolvedGroupLabel} 대상</span>}
        </div>
        <div className="topic-row">
          <input
            type="text"
            value={project.topic}
            placeholder="예: 2026년 임신·출산 지원금 총정리"
            disabled={pipeline.running}
            onChange={(e) => update({ topic: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && resolvedGroupId && !pipeline.running) startPipeline(); }}
          />
          <button
            className="primary"
            disabled={pipeline.running || rendering || !project.topic.trim() || !resolvedGroupId}
            onClick={() => startPipeline()}
          >
            {pipeline.running ? "만드는 중..." : hasContent ? "이 주제로 다시 만들기" : "만들기 →"}
          </button>
        </div>

        {/* 주제에서 대상을 못 알아낸 경우에만 물어본다 — 아무거나 찍어서 진행하지 않기 위함 */}
        {project.topic.trim() && !guess && (
          <div className="topic-row" style={{ marginTop: 8 }}>
            <select value={manualGroupId} onChange={(e) => setManualGroupId(e.target.value)} style={{ flex: 1 }}>
              <option value="">주제에서 대상을 알아내지 못했습니다 — 직접 골라주세요</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
        )}

        {guess && (
          <div className="item-meta" style={{ marginTop: 6 }}>
            주제에 들어간 "{guess.matchedWord}" → <b>{guess.groupLabel}</b> 대상으로 자료를 찾습니다.
          </div>
        )}

        {!project.topic.trim() && (
          <div className="chips" style={{ marginTop: 8 }}>
            {Object.values(TOPIC_EXAMPLES).slice(0, 3).map((t) => (
              <button key={t} type="button" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => update({ topic: t })}>
                {t}
              </button>
            ))}
          </div>
        )}

        <label className="item-meta" style={{ display: "block", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={project.isSponsoredContent === true}
            onChange={(e) => update({ isSponsoredContent: e.target.checked })}
          />{" "}
          이 콘텐츠는 정부/기관의 지원(협찬)을 받아 제작됨
        </label>

        {pipeline.running && <div className="notice" style={{ marginTop: 10 }}>⏳ {pipeline.statusText}</div>}
        {pipeline.error && <div className="error" style={{ marginTop: 8 }}>{pipeline.error}</div>}

        {pipeline.blockingWarning && (
          <div className="notice" style={{ marginTop: 10 }}>
            <b>진행 전 확인이 필요합니다</b>
            {pipeline.blockingWarning.checks.filter((c) => c.status === "warning").map((c, i) => (
              <div key={i} style={{ marginTop: 6 }}>· {c.label}: {c.detail}</div>
            ))}
            <div style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => startPipeline(true)}>그래도 계속</button>
            </div>
          </div>
        )}
      </div>

      {!hasContent && !pipeline.running && (
        <div className="card">
          <div className="empty">
            아직 만든 내용이 없습니다. 위에 주제를 입력하고 "만들기"를 누르면 자료를 찾아
            카드뉴스를 구성해드립니다(1~3분 정도 걸립니다).
          </div>
        </div>
      )}

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
            <div className="field-label">BGM 프리셋 <span className="pill pill-live">영상에 반영됨</span></div>
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
            <div className="field-label">SFX 전환 효과음 <span className="pill pill-live">영상에 반영됨</span></div>
            <select value={project.audio.sfxPreset} onChange={(e) => updateAudio({ sfxPreset: e.target.value })}>
              {SFX_PRESETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <VolumeSlider value={project.audio.sfxVolume} onChange={(v) => updateAudio({ sfxVolume: v })} />
          </div>

          <div className="item-meta">
            BGM은 나레이션보다 작게 깔리고 끝에서 서서히 사라집니다. 효과음은 카드가 넘어갈 때마다
            울립니다. "내 음원 파일"만 아직 실제 영상에 안 들어갑니다(업로드 기능 미구현).
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

        {/* ── 우: 배포 & 자막 위치 ──
             예전 시작 화면에 있던 "배포 플랫폼" 선택을 여기로 합쳤다(사용자 지시).
             플랫폼은 후킹 문구·해시태그를 그 플랫폼에 맞게 만드는 데 쓰이고,
             배포 규격은 실제 영상의 화면 비율을 정한다. */}
        <div className="card panel">
          <div className="card-head"><h2>📱 배포 &amp; 자막</h2></div>

          <div className="field-group">
            <div className="field-label">배포 플랫폼 <span className="pill pill-live">후킹·해시태그에 반영됨</span></div>
            <select
              value={project.platformId}
              disabled={pipeline.running}
              onChange={(e) => update({ platformId: e.target.value })}
            >
              <option value="youtube_shorts">유튜브 쇼츠</option>
              <option value="tiktok">틱톡</option>
              <option value="instagram_reels">인스타그램 릴스</option>
            </select>
            <div className="item-meta">
              플랫폼을 바꾸면 다음에 "만들기"를 눌렀을 때부터 반영됩니다.
            </div>
          </div>

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
            <div className="field-label">도입부 연출 <span className="pill pill-live">영상에 반영됨</span></div>
            <label className="item-meta" style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={project.withIntro}
                onChange={(e) => update({ withIntro: e.target.checked })}
              />{" "}
              맨 앞에 3초 도입부 붙이기
            </label>
            <div className="item-meta">
              금색 티켓이 빛을 끌며 날아와 자리잡는 연출입니다. 영상이 3초 길어집니다.
            </div>
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

      {/* 지역 한정이라 뺀 항목 — 조용히 버리지 않고 무엇을 왜 뺐는지 보여준다 */}
      {!!project.collection?.excludedRegional?.length && (
        <div className="card">
          <div className="card-head">
            <h2>🗺 제외된 지역 한정 사업</h2>
            <span className="pill pill-todo">{project.collection.excludedRegional.length}건 제외</span>
          </div>
          <div className="item-meta" style={{ marginBottom: 8 }}>
            특정 지역에서만 신청할 수 있는 사업이라 전국 대상 영상에서 뺐습니다.
          </div>
          {project.collection.excludedRegional.map((e, i) => (
            <div className="item" key={i}>
              <div className="item-title">{e.title}</div>
              <div className="item-meta">{e.reason}</div>
            </div>
          ))}
        </div>
      )}

      <AdReferencePanel report={project.adReferences} />

      <VideoLibrary reloadKey={project.videoJobId ?? ""} />
    </div>
  );
}

interface VideoListItem {
  id: string;
  title: string;
  groupLabel: string;
  durationSeconds: number | null;
  createdAt: string;
  sizeBytes: number;
  downloadUrl: string;
}

// 만들어 둔 영상 목록.
// 그동안은 영상을 만든 직후에만 볼 수 있었고 새로고침하면 사라졌다 — 지난 결과를
// 화면에서 다시 확인할 수 있어야 한다는 요청에 따라 추가.
function VideoLibrary({ reloadKey }: { reloadKey: string }) {
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<string>("");

  useEffect(() => {
    getJson<{ videos: VideoListItem[] }>("/api/video/list")
      .then((d) => setVideos(d.videos))
      .catch((e) => setError(e.message));
  }, [reloadKey]);

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>🎬 만든 영상</h2>
        <span className="pill pill-live">{videos.length}개</span>
      </div>

      {error && <div className="error">{error}</div>}
      {!error && !videos.length && <div className="empty">아직 만든 영상이 없습니다.</div>}

      {videos.map((v) => (
        <div className="item" key={v.id}>
          <div className="item-title">
            {v.groupLabel && <span className="badge unchanged">{v.groupLabel}</span>}
            {v.title}
          </div>
          <div className="item-meta">
            {fmtDate(v.createdAt)}
            {v.durationSeconds ? ` · ${v.durationSeconds}초` : ""}
            {` · ${Math.round(v.sizeBytes / 1024 / 1024 * 10) / 10}MB`}
          </div>
          <div className="chips" style={{ marginTop: 6 }}>
            <button onClick={() => setPlaying(playing === v.id ? "" : v.id)} style={{ fontSize: 12, padding: "4px 10px" }}>
              {playing === v.id ? "닫기" : "▶ 재생"}
            </button>
            <a href={v.downloadUrl} download={`${v.title || v.id}.mp4`}>
              <button style={{ fontSize: 12, padding: "4px 10px" }}>⬇ 다운로드</button>
            </a>
          </div>
          {playing === v.id && (
            <video
              src={v.downloadUrl}
              controls
              autoPlay
              style={{ width: "100%", maxWidth: 260, display: "block", marginTop: 10, borderRadius: 8, background: "#000" }}
            />
          )}
        </div>
      ))}
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
