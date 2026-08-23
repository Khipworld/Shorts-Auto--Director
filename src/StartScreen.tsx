import { useEffect, useState } from "react";
import { getJson } from "./api";
import { TOPIC_EXAMPLES } from "./studioOptions";
import type { StartOptions } from "./App";
import type { LifecycleGroup } from "./types";

const PLATFORMS = [
  { id: "youtube_shorts", label: "유튜브 쇼츠" },
  { id: "tiktok", label: "틱톡" },
  { id: "instagram_reels", label: "인스타그램 릴스" },
];

// 시작 화면 — 대상 그룹/플랫폼과 함께 "이번 영상의 주제"를 직접 입력받는다.
// 주제 입력란은 K-Street 온보딩("주제를 입력하세요" + 예시로 빠르게 시작하기) 패턴을 따름.
export default function StartScreen({ onStart }: { onStart: (opts: StartOptions) => void }) {
  const [groups, setGroups] = useState<LifecycleGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [topic, setTopic] = useState("");
  const [platformId, setPlatformId] = useState(PLATFORMS[0].id);
  const [isSponsoredContent, setIsSponsoredContent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJson<{ groups: LifecycleGroup[] }>("/api/pipeline/1/groups")
      .then((d) => {
        setGroups(d.groups);
        setGroupId(d.groups[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const exampleTopic = TOPIC_EXAMPLES[groupId];

  return (
    <div>
      <h1>Shorts Auto Director</h1>
      <div className="sub">주제를 정하면 자료수집부터 대본·자막까지 자동으로 초안을 만들어드립니다. 다음 화면에서 직접 검토·수정할 수 있어요.</div>

      <div className="card">
        <div className="card-head"><h2>1. 대상 그룹</h2></div>
        <div className="item-meta" style={{ marginBottom: 8 }}>정보/시사성 &gt; 정부지원사업·정책 안내 (현재 지원되는 유일한 카테고리)</div>
        {error && <div className="error">{error}</div>}
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: "100%", marginBottom: 4 }}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        {selectedGroup && <div className="item-meta">검색 키워드: {selectedGroup.searchHint}</div>}

        <div className="card-head" style={{ marginTop: 20 }}>
          <h2>2. 주제</h2>
          <span className="pill pill-live">자료 검색에 반영됨</span>
        </div>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={exampleTopic ? `예: ${exampleTopic}` : "예: 2026년 청년 지원 정책 총정리"}
          style={{ width: "100%" }}
        />
        <div className="item-meta" style={{ marginTop: 6 }}>
          입력한 주제로 자료를 좁혀서 찾습니다. 비워두면 위에서 고른 그룹 전체를 훑습니다.
          너무 좁게 쓰면 근거 자료를 못 찾을 수 있으니, 그럴 땐 조금 넓게 바꿔주세요.
        </div>
        {exampleTopic && !topic && (
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setTopic(exampleTopic)} style={{ fontSize: 12, padding: "4px 10px" }}>
              예시로 빠르게 시작: {exampleTopic}
            </button>
          </div>
        )}

        <div className="card-head" style={{ marginTop: 20 }}><h2>3. 배포 플랫폼</h2></div>
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} style={{ width: "100%" }}>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        <label className="item-meta" style={{ display: "block", marginTop: 16 }}>
          <input type="checkbox" checked={isSponsoredContent} onChange={(e) => setIsSponsoredContent(e.target.checked)} />
          {" "}이 콘텐츠는 정부/기관의 지원(협찬)을 받아 제작됨
        </label>

        <div style={{ marginTop: 20 }}>
          <button
            className="primary"
            disabled={!groupId}
            onClick={() =>
              onStart({
                groupId,
                groupLabel: selectedGroup?.label ?? groupId,
                platformId,
                topic: topic.trim(),
                isSponsoredContent,
              })
            }
          >
            시작하기 →
          </button>
        </div>
      </div>
    </div>
  );
}
