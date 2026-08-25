import { useEffect, useRef, useState } from "react";
import { callPipeline, getJson } from "./api";
import { getCardTheme } from "./cardTheme";
import { DEFAULT_BRAND, getBrandTheme } from "./brand";
import { cardsToNarration } from "./buildCards";
import { VOICE_PRESETS, BGM_PRESETS, SFX_PRESETS, VIDEO_FORMATS, getFormat } from "./studioOptions";
import { buildTimedLines, formatTimecode, totalEstimatedSeconds, SEGMENT_LABEL, OPTIMAL_MAX_SECONDS, OPTIMAL_MIN_SECONDS } from "./subtitleTiming";
import { inferCategory } from "./pipeline/0-category/categories";
import { makeScopeKey } from "./pipeline/0-category/scope";
import { usePipeline } from "./usePipeline";
import type { ProjectState, CardItem, AudioSettings, SubtitleLayout } from "./App";
import type { SubtitleLine, LifecycleGroup } from "./types";
import type { MusicItem } from "./pipeline/8-platform-output/musicLibrary.server";

/** 서버가 내려주는 카테고리 목록 항목 (설정은 서버에만 두고 고르는 데 필요한 것만 받는다) */
interface CategoryOption {
  id: string;
  label: string;
  summary: string;
  examples: string[];
  bannerText: string;
  ctaHeadline: string;
  ctaButton: string;
}

interface Props {
  project: ProjectState;
  updateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  onReset: () => void;
  onOpenWorkLog: () => void;
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
export default function StudioScreen({ project, updateProject, onReset, onOpenWorkLog }: Props) {
  const theme = getCardTheme(project.groupId);
  const brandTheme = getBrandTheme(DEFAULT_BRAND, project.groupId);
  const [selected, setSelected] = useState(0); // 0 = 후킹, 1.. = cards[i-1]
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const bgmFileRef = useRef<HTMLInputElement>(null);

  // 성우 미리듣기 — 영상을 다 만들지 않고 목소리만 먼저 확인한다.
  const [samplePlaying, setSamplePlaying] = useState(false);
  const [sampleUrl, setSampleUrl] = useState("");
  const [sampleError, setSampleError] = useState("");

  const [groups, setGroups] = useState<LifecycleGroup[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  // 사용자 지시: 자동 인식 대신 선택 상자로 직접 고른다. 주제를 치면 후보를 제안만 한다.
  const [categoryId, setCategoryId] = useState("");
  const [audience, setAudience] = useState(""); // 공공정보에서만 쓰는 대상(임신부 등)
  // 상세 지시·소재는 평소 접어둔다 — 주제와 카테고리만으로도 만들 수 있어야 하기 때문.
  const [briefOpen, setBriefOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const imageFileRef = useRef<HTMLInputElement>(null);

  // 내 음원 보관함 — 올린 파일은 서버(.data/music)에 남아 다음에 켰을 때도 그대로 있다.
  const [musicItems, setMusicItems] = useState<MusicItem[]>([]);
  const [musicBusy, setMusicBusy] = useState("");   // 올리는 중인 파일 이름
  const [musicError, setMusicError] = useState("");
  const [musicPlaying, setMusicPlaying] = useState(""); // 미리 듣는 중인 음원 id

  const pipeline = usePipeline(project, updateProject);

  // 내 음원을 실제로 쓰는 조건: 켜져 있고 + 곡을 골랐을 때. 이때는 프리셋 BGM을 대신한다.
  const useMyMusic = project.audio.customBgmEnabled && !!project.audio.customBgmId;

  const loadMusic = async () => {
    try {
      const d = await getJson<{ items: MusicItem[] }>("/api/music/list");
      setMusicItems(d.items);
      return d.items;
    } catch {
      setMusicItems([]);
      return [];
    }
  };
  useEffect(() => { void loadMusic(); }, []);

  // 보관함에서 고른 음원이 사라졌으면(다른 곳에서 지웠다든지) 선택을 비운다.
  useEffect(() => {
    if (!project.audio.customBgmId) return;
    if (musicItems.some((m) => m.id === project.audio.customBgmId)) return;
    if (!musicItems.length) return; // 아직 못 불러온 상태와 구분
    updateAudio({ customBgmId: "", customBgmName: "" });
  }, [musicItems]);

  const uploadMusic = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setMusicError("");
    for (const file of list) {
      setMusicBusy(file.name);
      try {
        const res = await fetch("/api/music/upload", {
          method: "POST",
          headers: {
            "content-type": file.type || "application/octet-stream",
            // 한글 파일명이 헤더에서 깨지지 않도록 encode해서 보낸다
            "x-file-name": encodeURIComponent(file.name),
          },
          body: file,
        });
        // 서버가 JSON이 아닌 답(연결 끊김·오류 페이지 등)을 줄 수 있으므로 글로 먼저 받는다.
        // 바로 .json()을 부르면 "Unexpected end of JSON input" 같은 알아볼 수 없는 오류가 뜬다.
        const text = await res.text();
        let data: { item?: MusicItem; error?: string } = {};
        try { data = text ? JSON.parse(text) : {}; } catch { /* JSON이 아니면 아래에서 처리 */ }
        if (!data.item) {
          if (data.error) throw new Error(data.error);
          if (res.status === 413) throw new Error("파일이 너무 큽니다 (최대 80MB).");
          if (!text) throw new Error("서버 응답이 끊겼습니다. 잠시 후 다시 시도해 주세요.");
          throw new Error(`업로드 실패 (서버 응답 ${res.status})`);
        }
        setMusicItems((prev) => [data.item as MusicItem, ...prev]);
        // 처음 올린 곡은 바로 쓸 수 있게 골라 둔다 — 한 번 더 누르게 하지 않기 위함.
        updateAudio({
          customBgmEnabled: true,
          customBgmId: data.item.id,
          customBgmName: data.item.name,
        });
      } catch (e) {
        setMusicError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setMusicBusy("");
  };

  const deleteMusic = async (m: MusicItem) => {
    if (!window.confirm(`"${m.name}" 을(를) 보관함에서 지울까요? 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch(`/api/music/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorTextOf(res, "삭제하지 못했습니다."));
      setMusicItems((prev) => prev.filter((x) => x.id !== m.id));
      if (musicPlaying === m.id) setMusicPlaying("");
      if (project.audio.customBgmId === m.id) updateAudio({ customBgmId: "", customBgmName: "" });
    } catch (e) {
      setMusicError(e instanceof Error ? e.message : String(e));
    }
  };

  const renameMusic = async (m: MusicItem) => {
    const next = window.prompt("새 이름", m.name);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === m.name) return;
    try {
      const res = await fetch(`/api/music/${m.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await errorTextOf(res, "이름을 바꾸지 못했습니다."));
      setMusicItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, name } : x)));
      if (project.audio.customBgmId === m.id) updateAudio({ customBgmName: name });
    } catch (e) {
      setMusicError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    getJson<{ groups: LifecycleGroup[] }>("/api/pipeline/1/groups")
      .then((d) => setGroups(d.groups))
      .catch(() => setGroups([]));
    getJson<{ categories: CategoryOption[] }>("/api/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => setCategories([]));
  }, []);

  // 주제에서 카테고리 후보를 제안한다 — 고르는 건 사용자다(자동으로 정하지 않음).
  const suggestion = inferCategory(project.topic);
  const suggestedId = suggestion?.category.id ?? "";
  const effectiveCategoryId = categoryId || suggestedId;
  const selectedCategory = categories.find((c) => c.id === effectiveCategoryId);
  // 공공정보는 대상(임신부·청년 등)까지 골라야 예전과 같은 자료를 찾는다.
  const needsAudience = effectiveCategoryId === "public_info";
  const canStart = !!effectiveCategoryId && (!needsAudience || !!audience);
  const scopeKey = effectiveCategoryId ? makeScopeKey(effectiveCategoryId, audience) : "";
  const scopeLabel = audience || selectedCategory?.label || "";
  const hasContent = project.cards.length > 0 || project.hookHeadline.trim().length > 0;

  async function playVoiceSample() {
    setSamplePlaying(true);
    setSampleError("");
    setSampleUrl("");
    try {
      // 지금 만들고 있는 후킹 문구가 있으면 그걸로, 없으면 기본 문장으로 읽는다.
      const text = project.hookHeadline.trim() || undefined;
      const { url } = await callPipeline<{ url: string }>("/api/tts/sample", {
        voicePreset: project.audio.voicePreset,
        speed: project.audio.speechSpeed,
        text,
      });
      setSampleUrl(url);
    } catch (e: any) {
      setSampleError(e?.message || "샘플을 만들지 못했습니다.");
    } finally {
      setSamplePlaying(false);
    }
  }

  async function startPipeline(skipWarning = false) {
    if (!canStart) return;
    await pipeline.run(
      {
        groupId: scopeKey,
        groupLabel: scopeLabel,
        platformId: project.platformId,
        topic: project.topic.trim(),
        categoryId: effectiveCategoryId,
        categoryLabel: categories.find((c) => c.id === effectiveCategoryId)?.label ?? "",
        isSponsoredContent: project.brief.isSponsoredContent,
      },
      skipWarning
    );
  }

  // 배너 문구는 카테고리마다 다르다("정부지원 안내" / "상품 정보" / "여행 정보"...).
  // 미리보기와 실제 영상이 어긋나지 않도록 여기서 한 번만 만들어 양쪽에 같은 값을 넘긴다.
  // 대상이 따로 있으면(임신부 등) 앞에 붙인다: "임신부 정부지원 안내".
  const activeCategory = categories.find((c) => c.id === (project.categoryId || effectiveCategoryId));
  const bannerText =
    activeCategory
      ? project.groupLabel && project.groupLabel !== activeCategory.label
        ? `${project.groupLabel} ${activeCategory.bannerText}`
        : activeCategory.bannerText
      : project.groupLabel;

  const videoUrl = project.videoJobId ? `/api/video/download/${project.videoJobId}` : "";
  const timedLines = buildTimedLines(project.hookHeadline, project.cards, project.audio.speechSpeed);
  const totalSeconds = totalEstimatedSeconds(timedLines);
  const format = getFormat(project.formatId);

  function update(patch: Partial<ProjectState>) {
    updateProject((prev) => ({ ...prev, ...patch }));
  }
  function updateBrief(patch: Partial<ProjectState["brief"]>) {
    updateProject((prev) => ({ ...prev, brief: { ...prev.brief, ...patch } }));
  }
  function addMaterial(kind: "url" | "image" | "audio", value: string) {
    const v = value.trim();
    if (!v) return;
    updateProject((prev) => ({ ...prev, materials: [...prev.materials, { kind, value: v }] }));
  }
  function removeMaterial(idx: number) {
    updateProject((prev) => ({ ...prev, materials: prev.materials.filter((_, i) => i !== idx) }));
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
      // 배너·CTA 문구는 카테고리마다 다르다. 목록을 아직 못 받았으면 예전 문구를 그대로 쓴다.
      const cat = categories.find((c) => c.id === project.categoryId);
      const badgeText = project.groupLabel || cat?.label || "";

      const slides = [
        { kind: "hook" as const, badge: badgeText, headline: project.hookHeadline },
        ...project.cards.map((c) => {
          // 설명에서 금액·수치를 뽑아 크게 강조한다(카드뉴스의 기본 문법).
          const m = /((?:월\s*)?[\d,]+\s*(?:만원|원|억|%|명|일|개월|년))/.exec(c.detail);
          return { kind: "card" as const, number: c.badge, title: c.title, detail: c.detail, highlight: m ? m[1].trim() : undefined };
        }),
        {
          kind: "cta" as const,
          badge: badgeText,
          headline: cat?.ctaHeadline ?? "자세한 내용은 링크에서",
          buttonText: cat?.ctaButton ?? "프로필 링크에서 확인",
          footnote: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 기준`,
        },
      ].filter((s) => (s.kind === "card" ? s.title.trim() : s.headline.trim()));

      const { jobId } = await callPipeline<{ jobId: string }>("/api/video/render", {
        title: project.topic || project.script?.title || project.hookHeadline,
        groupLabel: project.groupLabel,
        aspectRatio: format.ratio,
        voicePreset: project.audio.voicePreset,
        speechSpeed: project.audio.speechSpeed,
        bgmTrack: useMyMusic
          ? `custom:${project.audio.customBgmId}`
          : project.audio.bgmEnabled ? project.audio.bgmPreset : "none",
        bgmVolume: useMyMusic ? project.audio.customBgmVolume : project.audio.bgmVolume,
        sfxTrack: project.audio.sfxEnabled ? project.audio.sfxPreset : "none",
        sfxVolume: project.audio.sfxVolume,
        subtitleLayout: project.subtitleLayout,
        withIntro: project.withIntro,
        bannerText,
        channelName: DEFAULT_BRAND.channelName,
        logoSrc: DEFAULT_BRAND.showLogo ? DEFAULT_BRAND.logoPath : undefined,
        highlightColor: brandTheme.highlight,
        slideTheme: { gradientFrom: brandTheme.gradientTop, gradientTo: brandTheme.gradientBottom, accent: brandTheme.highlight },
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
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button className="ghost" onClick={onOpenWorkLog}>📋 작업 기록</button>
          {hasContent && <button className="ghost" onClick={onReset}>← 처음부터</button>}
        </div>
      </div>

      {/* 주제 입력 — 이 화면의 시작점.
          사용자 지시(2026-08-24): 카테고리는 자동 인식이 아니라 선택 상자로 직접 고른다.
          주제를 치면 후보만 제안하고, 최종 결정은 사용자가 한다. */}
      <div className="card topic-bar">
        <div className="field-label" style={{ marginBottom: 8 }}>
          📝 어떤 주제로 만들까요?
          {selectedCategory && <span className="pill pill-live">{selectedCategory.label}</span>}
        </div>

        <div className="topic-row" style={{ marginBottom: 8 }}>
          <select
            value={effectiveCategoryId}
            disabled={pipeline.running}
            onChange={(e) => { setCategoryId(e.target.value); setAudience(""); }}
            style={{ flex: 1 }}
          >
            <option value="">카테고리를 골라주세요</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label} — {c.summary}</option>
            ))}
          </select>
          {needsAudience && (
            <select
              value={audience}
              disabled={pipeline.running}
              onChange={(e) => setAudience(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">대상을 골라주세요</option>
              {groups.map((g) => <option key={g.id} value={g.label}>{g.label}</option>)}
            </select>
          )}
        </div>
        <div className="topic-row">
          <input
            type="text"
            value={project.topic}
            placeholder="예: 2026년 임신·출산 지원금 총정리"
            disabled={pipeline.running}
            onChange={(e) => update({ topic: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && canStart && !pipeline.running) startPipeline(); }}
          />
          <button
            className="primary"
            disabled={pipeline.running || rendering || !project.topic.trim() || !canStart}
            onClick={() => startPipeline()}
          >
            {pipeline.running ? "만드는 중..." : hasContent ? "이 주제로 다시 만들기" : "만들기 →"}
          </button>
        </div>

        {/* 주제에서 카테고리를 짐작할 수 있으면 알려만 준다 — 고르는 건 사용자 */}
        {suggestion && !categoryId && (
          <div className="item-meta" style={{ marginTop: 6 }}>
            주제에 들어간 "{suggestion.matchedWord}" → <b>{suggestion.category.label}</b>로 짐작했습니다. 다르면 위에서 바꿔주세요.
          </div>
        )}
        {needsAudience && !audience && (
          <div className="item-meta" style={{ marginTop: 6 }}>
            공공정보는 누구를 위한 정보인지에 따라 찾는 자료가 달라집니다 — 대상도 골라주세요.
          </div>
        )}

        {!project.topic.trim() && !!selectedCategory && selectedCategory.examples.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {selectedCategory.examples.map((t) => (
              <button key={t} type="button" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => update({ topic: t })}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* 소재 — URL·사진·음악을 주제와 함께 넣는다 */}
        <div className="material-row">
          <input
            type="text"
            value={urlInput}
            placeholder="🔗 참고할 URL을 붙여넣으세요 (상품 페이지, 기사 등)"
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { addMaterial("url", urlInput); setUrlInput(""); } }}
          />
          <button onClick={() => { addMaterial("url", urlInput); setUrlInput(""); }} disabled={!urlInput.trim()}>추가</button>
          <button onClick={() => imageFileRef.current?.click()} title="영상에 넣을 사진">🖼 사진</button>
          <input
            ref={imageFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              Array.from(e.target.files ?? []).forEach((f) => addMaterial("image", f.name));
              e.target.value = "";
            }}
          />
        </div>

        {project.materials.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {project.materials.map((m, i) => (
              <span className="chip" key={i}>
                {m.kind === "url" ? "🔗" : m.kind === "image" ? "🖼" : "🎵"}{" "}
                {m.value.length > 42 ? m.value.slice(0, 40) + "…" : m.value}
                <button onClick={() => removeMaterial(i)} title="빼기">✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="item-meta" style={{ marginTop: 6 }}>
          소재는 아직 영상에 반영되지 않습니다 — 넣어두면 다음 작업에서 씁니다.
          <b> 음악 파일은 왼쪽 "내 음원 파일"에서 넣습니다.</b>
        </div>

        {/* 상세 지시 — 평소엔 접혀 있고 필요할 때만 편다 */}
        <button className="fold-toggle" onClick={() => setBriefOpen((v) => !v)}>
          {briefOpen ? "▾" : "▸"} 상세 지시 {briefOpen ? "접기" : "펼치기"}
          <span className="item-meta" style={{ marginLeft: 6 }}>비워두면 알아서 정합니다</span>
        </button>

        {briefOpen && (
          <div className="brief-grid">
            <label>
              <span>누구에게</span>
              <input type="text" value={project.brief.audience} placeholder="예: 20대 사회초년생"
                onChange={(e) => updateBrief({ audience: e.target.value })} />
            </label>
            <label>
              <span>원하는 행동</span>
              <select value={project.brief.goal} onChange={(e) => updateBrief({ goal: e.target.value })}>
                <option value="">자동</option>
                <option value="inform">정보 전달</option>
                <option value="visit">방문 유도</option>
                <option value="buy">구매 유도</option>
                <option value="subscribe">구독 유도</option>
              </select>
            </label>
            <label>
              <span>톤</span>
              <select value={project.brief.tone} onChange={(e) => updateBrief({ tone: e.target.value })}>
                <option value="">자동</option>
                <option value="informative">정보전달</option>
                <option value="friendly">친근</option>
                <option value="urgent">긴박</option>
                <option value="emotional">감성</option>
              </select>
            </label>
            <label>
              <span>길이 목표</span>
              <select value={String(project.brief.targetSeconds)} onChange={(e) => updateBrief({ targetSeconds: Number(e.target.value) })}>
                <option value="0">자동 (20~35초)</option>
                <option value="15">15초</option>
                <option value="30">30초</option>
                <option value="60">60초</option>
                <option value="-1">음악 길이에 맞춤</option>
              </select>
            </label>
            <label className="wide">
              <span>꼭 넣을 내용</span>
              <input type="text" value={project.brief.mustInclude} placeholder="반드시 담아야 할 문구·수치"
                onChange={(e) => updateBrief({ mustInclude: e.target.value })} />
            </label>
            <label className="wide">
              <span>빼야 할 내용</span>
              <input type="text" value={project.brief.mustAvoid} placeholder="언급하면 안 되는 것"
                onChange={(e) => updateBrief({ mustAvoid: e.target.value })} />
            </label>
            <label className="wide check">
              <input type="checkbox" checked={project.brief.isSponsoredContent}
                onChange={(e) => updateBrief({ isSponsoredContent: e.target.checked })} />
              <span>협찬·지원을 받아 제작된 콘텐츠</span>
            </label>
          </div>
        )}

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
            <div className="inline-row">
              <select value={project.audio.voicePreset} onChange={(e) => updateAudio({ voicePreset: e.target.value })}>
                {VOICE_PRESETS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <button onClick={playVoiceSample} disabled={samplePlaying} title="지금 고른 성우로 한 문장을 읽어봅니다">
                {samplePlaying ? "…" : "▶ 샘플"}
              </button>
            </div>
            {sampleError && <div className="error" style={{ marginTop: 6 }}>{sampleError}</div>}
            {sampleUrl && (
              <audio key={sampleUrl} src={sampleUrl} controls autoPlay style={{ width: "100%", marginTop: 8 }} />
            )}
            <div className="dial-group" style={{ marginTop: 8 }}>
              <Dial
                icon="⏩" name="속도" min={80} max={180} unit="%"
                value={Math.round(project.audio.speechSpeed * 100)}
                onChange={(v) => updateAudio({ speechSpeed: v / 100 })}
              />
            </div>
            <div className="item-meta">속도를 낮추면 성우가 천천히 읽어 영상이 길어집니다(기본 140%).</div>
          </div>

          <div className="field-group">
            <label className="use-toggle">
              <input type="checkbox" checked={project.audio.bgmEnabled}
                onChange={(e) => updateAudio({ bgmEnabled: e.target.checked })} />
              <span className="field-label" style={{ margin: 0 }}>BGM 프리셋 <span className="pill pill-live">영상에 반영됨</span></span>
            </label>
            <select value={project.audio.bgmPreset} disabled={!project.audio.bgmEnabled}
              onChange={(e) => updateAudio({ bgmPreset: e.target.value })}>
              {BGM_PRESETS.filter((b) => b.id !== "none").map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <VolumeSlider value={project.audio.bgmVolume} disabled={!project.audio.bgmEnabled}
              onChange={(v) => updateAudio({ bgmVolume: v })} />
          </div>

          <div className="field-group">
            <label className="use-toggle">
              <input type="checkbox" checked={project.audio.customBgmEnabled}
                onChange={(e) => updateAudio({ customBgmEnabled: e.target.checked })} />
              <span className="field-label" style={{ margin: 0 }}>
                내 음원 파일 <span className="pill pill-live">영상에 반영됨</span>
              </span>
            </label>
            <div className="item-meta" style={{ marginBottom: 6 }}>
              켜고 곡을 고르면 프리셋 BGM 대신 그 곡이 깔립니다. 올린 파일은 보관함에 남습니다.
            </div>

            {/* 올리는 줄 — 버튼이 한 줄을 통째로 쓰지 않게 개수 표시와 나란히 둔다 */}
            <div className="inline-row" style={{ marginBottom: 6 }}>
              <button
                style={{ flex: 1 }}
                disabled={!project.audio.customBgmEnabled || !!musicBusy}
                onClick={() => bgmFileRef.current?.click()}
              >
                {musicBusy ? `⏳ ${musicBusy} 올리는 중…` : "📁 음원 파일 올리기"}
              </button>
              <span className="lib-count">{musicItems.length}곡</span>
            </div>
            <input
              ref={bgmFileRef}
              type="file"
              accept="audio/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => { void uploadMusic(e.target.files); e.target.value = ""; }}
            />
            {musicError && <div className="error" style={{ marginBottom: 6 }}>{musicError}</div>}

            {/* 보관함 — 곡이 늘어도 패널이 계속 길어지지 않게 목록만 따로 스크롤한다 */}
            {musicItems.length === 0 ? (
              <div className="lib-empty">아직 올린 음원이 없습니다.</div>
            ) : (
              <div className={`music-lib${project.audio.customBgmEnabled ? "" : " disabled"}`}>
                {musicItems.map((m) => {
                  const picked = project.audio.customBgmId === m.id;
                  return (
                    <div className={`music-row${picked ? " picked" : ""}`} key={m.id}>
                      <input
                        type="radio"
                        name="my-music"
                        checked={picked}
                        disabled={!project.audio.customBgmEnabled}
                        onChange={() => updateAudio({ customBgmId: m.id, customBgmName: m.name })}
                        title="이 곡을 배경음으로 쓰기"
                      />
                      <span className="music-name" title={m.name} onDoubleClick={() => void renameMusic(m)}>
                        {m.name}
                      </span>
                      <span className="music-meta">
                        {m.durationSeconds ? fmtClock(m.durationSeconds) : "—"} · {fmtMB(m.sizeBytes)}
                      </span>
                      <button className="icon-btn" title="들어보기"
                        onClick={() => setMusicPlaying(musicPlaying === m.id ? "" : m.id)}>
                        {musicPlaying === m.id ? "■" : "▶"}
                      </button>
                      <button className="icon-btn" title="이름 바꾸기" onClick={() => void renameMusic(m)}>✎</button>
                      <button className="icon-btn danger" title="보관함에서 지우기"
                        onClick={() => void deleteMusic(m)}>✕</button>
                      {musicPlaying === m.id && (
                        <audio className="music-player" src={`/api/music/file/${m.id}`} controls autoPlay />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <VolumeSlider value={project.audio.customBgmVolume}
              disabled={!project.audio.customBgmEnabled || !project.audio.customBgmId}
              onChange={(v) => updateAudio({ customBgmVolume: v })} />
            {useMyMusic && (
              <div className="item-meta">🎵 {project.audio.customBgmName} 이(가) 깔립니다 (프리셋 BGM은 꺼짐).</div>
            )}
          </div>

          <div className="field-group">
            <label className="use-toggle">
              <input type="checkbox" checked={project.audio.sfxEnabled}
                onChange={(e) => updateAudio({ sfxEnabled: e.target.checked })} />
              <span className="field-label" style={{ margin: 0 }}>SFX 전환 효과음 <span className="pill pill-live">영상에 반영됨</span></span>
            </label>
            <select value={project.audio.sfxPreset} disabled={!project.audio.sfxEnabled}
              onChange={(e) => updateAudio({ sfxPreset: e.target.value })}>
              {SFX_PRESETS.filter((x) => x.id !== "none").map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <VolumeSlider value={project.audio.sfxVolume} disabled={!project.audio.sfxEnabled}
              onChange={(v) => updateAudio({ sfxVolume: v })} />
          </div>

          <div className="item-meta">
            BGM은 나레이션보다 작게 깔리고 끝에서 서서히 사라집니다. 효과음은 카드가 넘어갈 때마다
            울립니다. 내 음원을 고르면 프리셋 BGM 대신 그 곡이 쓰입니다.
          </div>
        </div>

        {/* ── 중앙: 미리보기 ── */}
        <div className="studio-center">
          <SlidePreview
            theme={theme}
            bannerText={bannerText}
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
            <div className="field-label">자막 위치 <span className="pill pill-live">영상에 반영됨</span></div>
            {/* 슬라이더 3개를 한 줄씩 — 아이콘·이름·눈금·현재값이 한 줄에 들어가 세로 공간을 아낀다 */}
            <div className="dial-group">
              <Dial icon="↕" name="상하" min={10} max={90} unit="%"
                value={project.subtitleLayout.vertical} onChange={(v) => updateLayout({ vertical: v })} />
              <Dial icon="↔" name="좌우" min={0} max={100} unit="%"
                value={project.subtitleLayout.horizontal} onChange={(v) => updateLayout({ horizontal: v })} />
              <Dial icon="⇥⇤" name="여백" min={2} max={20} unit="%"
                value={project.subtitleLayout.margin} onChange={(v) => updateLayout({ margin: v })} />
            </div>
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

      {/* 세로로 쌓으면 항목마다 오른쪽이 통째로 비어 목록이 한없이 길어진다.
          들어가는 만큼 가로로 채우고, 재생 중인 항목만 한 줄을 다 쓴다. */}
      <div className="video-grid">
      {videos.map((v) => (
        <div className={`item video-item${playing === v.id ? " playing" : ""}`} key={v.id}>
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
              style={{ width: "100%", maxWidth: 300, display: "block", marginTop: 10, borderRadius: 8, background: "#000" }}
            />
          )}
        </div>
      ))}
      </div>
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

/** 실패한 응답에서 사람이 읽을 수 있는 이유를 뽑는다. JSON이 아니어도 터지지 않는다. */
async function errorTextOf(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    try { return (JSON.parse(text) as { error?: string }).error ?? fallback; } catch { return fallback; }
  } catch {
    return fallback;
  }
}

/** 초 → 3:21 형태. 곡 길이를 짧게 보여줄 때 쓴다. */
function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** 바이트 → 4.2MB */
function fmtMB(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
}

function VolumeSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return <Dial icon="🔊" name="음량" min={0} max={100} unit="%" value={value} onChange={onChange} disabled={disabled} />;
}

/**
 * 한 줄짜리 조절기 — 아이콘·이름·눈금·현재값을 한 줄에 담는다.
 *
 * 예전에는 슬라이더 양옆에 "0% ... 100%" 같은 안내 글씨를 두어 줄마다 자리를 많이 먹었다.
 * 지금은 지나간 구간이 색으로 차오르고 현재값이 오른쪽에 숫자로 뜨므로,
 * 양끝 안내 없이도 상태를 바로 알 수 있고 세로 공간도 덜 쓴다.
 */
function Dial({
  icon, name, min, max, unit, value, onChange, disabled,
}: {
  icon: string; name: string; min: number; max: number; unit: string;
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={`dial${disabled ? " disabled" : ""}`}>
      <span className="dial-icon" aria-hidden>{icon}</span>
      <span className="dial-name">{name}</span>
      <input
        className="dial-range"
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${pct}%` }}
      />
      <span className="dial-value">{value}{unit}</span>
    </div>
  );
}

function SlidePreview({
  theme, bannerText, hookHeadline, cards, selected, layout, ratio,
}: {
  theme: ReturnType<typeof getCardTheme>;
  bannerText: string;
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
      <div className="phone-banner">{bannerText}</div>

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
