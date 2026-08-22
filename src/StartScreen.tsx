import { useEffect, useState } from "react";
import { getJson } from "./api";
import type { LifecycleGroup } from "./types";

const PLATFORMS = [
  { id: "youtube_shorts", label: "유튜브 쇼츠" },
  { id: "tiktok", label: "틱톡" },
  { id: "instagram_reels", label: "인스타그램 릴스" },
];

export default function StartScreen({ onStart }: { onStart: (groupId: string, groupLabel: string, platformId: string) => void }) {
  const [groups, setGroups] = useState<LifecycleGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [platformId, setPlatformId] = useState(PLATFORMS[0].id);
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

  return (
    <div>
      <h1>Shorts Auto Director</h1>
      <div className="sub">주제 하나를 고르면 자료수집부터 대본·자막까지 자동으로 초안을 만들어드립니다. 다음 화면에서 직접 검토·수정할 수 있어요.</div>

      <div className="card">
        <div className="card-head"><h2>1. 카테고리</h2></div>
        <div className="item-meta" style={{ marginBottom: 8 }}>정보/시사성 &gt; 정부지원사업·정책 안내 (현재 지원되는 유일한 카테고리)</div>

        <div className="card-head" style={{ marginTop: 16 }}><h2>2. 대상 그룹</h2></div>
        {error && <div className="error">{error}</div>}
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: "100%", marginBottom: 4 }}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
        {selectedGroup && <div className="item-meta">검색 키워드: {selectedGroup.searchHint}</div>}

        <div className="card-head" style={{ marginTop: 16 }}><h2>3. 배포 플랫폼</h2></div>
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} style={{ width: "100%" }}>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        <div style={{ marginTop: 20 }}>
          <button className="primary" disabled={!groupId} onClick={() => onStart(groupId, selectedGroup?.label ?? groupId, platformId)}>
            시작하기 →
          </button>
        </div>
      </div>
    </div>
  );
}
