import { useEffect, useMemo, useState } from "react";

// 작업 감사 & 진행 대시보드.
//
// K-Street(`C:\Claude_Project\src\WorkLogDashboard.tsx`)의 구성을 그대로 가져온 것.
// 사용자 지시: "K-Street 서버가 아니라 그 기능만 가져와서 여기서 새로 작성", "작업 내용뿐
// 아니라 시스템 구축, 달력도 있는데".
//
// 구성은 원본과 동일하다:
//   달력(날짜 선택) + 표1 시스템 구축 진행표 / 검색 / 표2 관제 데이터 상세기록
// K-Street은 Tailwind + lucide 아이콘을 쓰지만 이 프로젝트엔 없어서 같은 화면을
// 일반 CSS로 옮겼다(색·배치·표 항목은 원본을 따름).
interface WorkLogImplementation {
  githubFolder: string;
  commit: string;
  commitMessage: string;
  files: string[];
}

interface WorkLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  userRequest: string;
  aiResponse: string;
  implementation: WorkLogImplementation;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function WorkLogScreen({ onBack }: { onBack: () => void }) {
  const [projectStartDate, setProjectStartDate] = useState("");
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadEntries() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/worklog");
      if (!res.ok) throw new Error(`기록을 불러오지 못했습니다 (HTTP ${res.status}).`);
      const data = await res.json();
      setProjectStartDate(data.projectStartDate ?? "");
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e: any) {
      setLoadError(e?.message || "기록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  async function handleDeleteOne(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/worklog/${id}`, { method: "DELETE" });
      if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    setConfirmClearAll(false);
    const res = await fetch("/api/worklog", { method: "DELETE" });
    if (res.ok) setEntries([]);
  }

  const entriesByDate = useMemo(() => {
    const map = new Map<string, WorkLogEntry[]>();
    for (const e of entries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [entries]);

  const sortedDates = useMemo(() => {
    const dates: string[] = [];
    entriesByDate.forEach((_v, k) => dates.push(k));
    return dates.sort((a, b) => b.localeCompare(a));
  }, [entriesByDate]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (selectedDate && e.date !== selectedDate) return false;
      if (!q) return true;
      const haystack = [
        e.userRequest,
        e.aiResponse,
        e.implementation.githubFolder,
        e.implementation.commitMessage,
        e.implementation.commit,
        ...e.implementation.files,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, selectedDate, searchQuery]);

  // 달력 격자
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth(); // 0부터
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const fmtDate = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div className="wl">
      <div className="wl-head">
        <div>
          <h1 className="wl-title">📋 작업 감사 &amp; 진행 대시보드</h1>
          <div className="wl-sub">
            시스템 구축 진행표 + 관제 데이터 상세기록 (사용자 요청 · AI 응대 · 시스템 구현) 2개 표로 기록합니다
          </div>
        </div>
        <div className="wl-head-actions">
          <button className="wl-btn danger" onClick={() => setConfirmClearAll(true)}>전체 삭제</button>
          <button className="wl-btn" onClick={onBack}>← 스튜디오로</button>
        </div>
      </div>

      {loadError && <div className="wl-panel wl-error">{loadError}</div>}

      {confirmClearAll && (
        <div className="wl-confirm">
          <span>전체 기록 {entries.length}건을 정말 삭제할까요? 되돌릴 수 없습니다.</span>
          <span className="wl-confirm-actions">
            <button className="wl-btn danger" onClick={handleClearAll}>삭제</button>
            <button className="wl-btn" onClick={() => setConfirmClearAll(false)}>취소</button>
          </span>
        </div>
      )}

      <div className="wl-grid">
        {/* 달력 */}
        <div className="wl-panel">
          <div className="wl-panel-head">
            <span>📅 날짜 선택</span>
            <span className="wl-cal-nav">
              <button className="wl-icon" onClick={() => setCalendarCursor(new Date(year, month - 1, 1))}>‹</button>
              <span className="wl-cal-month">{year}년 {month + 1}월</span>
              <button className="wl-icon" onClick={() => setCalendarCursor(new Date(year, month + 1, 1))}>›</button>
            </span>
          </div>
          <div className="wl-cal-week">
            {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="wl-cal-grid">
            {calendarCells.map((d, idx) => {
              if (d === null) return <div key={idx} />;
              const dateStr = fmtDate(d);
              const hasEntries = entriesByDate.has(dateStr);
              const isStart = dateStr === projectStartDate;
              const isSelected = selectedDate === dateStr;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`wl-day${isSelected ? " selected" : ""}${isStart ? " start" : ""}`}
                >
                  {d}
                  {hasEntries && !isSelected && <span className="wl-dot" />}
                </button>
              );
            })}
          </div>
          <div className="wl-legend"><span className="wl-dot-start" /> 프로젝트 시작일 ({projectStartDate || "—"})</div>
          {selectedDate && (
            <button className="wl-btn wl-full" onClick={() => setSelectedDate(null)}>전체 날짜 보기</button>
          )}
        </div>

        {/* 표 1: 시스템 구축 진행표 */}
        <div className="wl-panel wl-nopad">
          <div className="wl-panel-head">
            <span>시스템 구축 진행표 (날짜 | 시스템 구축 진행 내용 | 작업 디렉토리(GitHub 위치) | 작업파일 | 커밋 상황 | 작업건수)</span>
            <span className="wl-count">전체 로그 {entries.length}건 / {sortedDates.length}일{loading ? " · 불러오는 중" : ""}</span>
          </div>
          <div className="wl-scroll">
            <table className="wl-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>날짜</th>
                  <th style={{ minWidth: 260 }}>시스템 구축 진행 내용</th>
                  <th style={{ minWidth: 150 }}>작업 디렉토리 (GitHub 위치)</th>
                  <th style={{ minWidth: 170 }}>작업파일</th>
                  <th style={{ minWidth: 120 }}>커밋 상황</th>
                  <th style={{ width: 100 }}>작업건수</th>
                </tr>
              </thead>
              <tbody>
                {!filteredEntries.length && !loading && (
                  <tr><td colSpan={6} className="wl-empty">표시할 기록이 없습니다.</td></tr>
                )}
                {filteredEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="wl-date">{e.date}<br /><span className="wl-time">{e.time}</span></td>
                    <td>{e.implementation.commitMessage || e.aiResponse}</td>
                    <td className="wl-mono">{e.implementation.githubFolder || "—"}</td>
                    <td>
                      {e.implementation.files.length
                        ? e.implementation.files.map((f) => <span className="wl-file" key={f}>{f}</span>)
                        : <span className="wl-dash">—</span>}
                    </td>
                    <td className="wl-mono">
                      {e.implementation.commit
                        ? <span className="wl-commit">{e.implementation.commit}</span>
                        : <span className="wl-uncommit">미커밋</span>}
                    </td>
                    <td className="wl-mono">{e.date}일 총 {entriesByDate.get(e.date)?.length ?? 1}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="wl-search">
        <span>🔍</span>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="검색어 (요청/응대/구현내용)..."
        />
      </div>

      {/* 표 2: 관제 데이터 상세기록 */}
      <div className="wl-panel wl-nopad">
        <div className="wl-panel-head">
          <span>관제 데이터 상세기록 (날짜 | 사용자 요청 | AI 응대 | 시스템 구현(CODE 진행))</span>
        </div>
        <div className="wl-scroll">
          <table className="wl-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>날짜</th>
                <th style={{ minWidth: 220 }}>사용자 요청</th>
                <th style={{ minWidth: 260 }}>AI 응대</th>
                <th style={{ minWidth: 230 }}>
                  시스템 구현 (CODE 진행)
                  <div className="wl-th-note">전체 코드 중 어느 부분을 구현/수정했는지</div>
                </th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {!filteredEntries.length && !loading && (
                <tr><td colSpan={5} className="wl-empty">표시할 기록이 없습니다.</td></tr>
              )}
              {filteredEntries.map((e) => (
                <tr key={e.id}>
                  <td className="wl-date">{e.date}<br /><span className="wl-time">{e.time}</span></td>
                  <td className="wl-pre">{e.userRequest}</td>
                  <td className="wl-pre">{e.aiResponse}</td>
                  <td>
                    {!!e.implementation.files.length && (
                      <div className="wl-impl-row">
                        <span className="wl-impl-ico">📄</span>
                        <span>{e.implementation.files.map((f) => <span className="wl-file" key={f}>{f}</span>)}</span>
                      </div>
                    )}
                    {e.implementation.commitMessage && (
                      <div className="wl-impl-row">
                        <span className="wl-impl-ico">⎇</span>
                        <span className="wl-pre">{e.implementation.commitMessage}</span>
                      </div>
                    )}
                    {!e.implementation.files.length && !e.implementation.commitMessage && <span className="wl-dash">—</span>}
                  </td>
                  <td>
                    <button
                      className="wl-del"
                      onClick={() => handleDeleteOne(e.id)}
                      disabled={deletingId === e.id}
                      title="이 기록 삭제"
                    >
                      {deletingId === e.id ? "…" : "🗑"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
