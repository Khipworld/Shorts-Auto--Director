// [[project-government-subsidy-content]]에서 확인된 한계: "신규/변경 여부"를 비교할 이전
// 회차 목록이 없어서 매번 자체 판단(주관적)으로만 표시했었음. 여기서는 그룹별 수집 결과를
// 실제로 로컬에 이력으로 남겨서, 다음 회차부터는 "이전에 본 URL/내용과 비교"라는 객관적
// 근거로 신규/변경/동일을 판정한다 — [3]검증 단계가 "형식적 통과"가 아니라는 걸 보여주는
// 실제 로그이기도 하다.
import fs from "node:fs";
import path from "node:path";

const HISTORY_DIR = path.join(process.cwd(), ".data", "collection-history");

export interface RawCollectedItem {
  title: string;
  summary: string;
  sourceUrl: string;
}

export type NoveltyStatus = "new" | "changed" | "unchanged";

export interface CollectedItemWithNovelty extends RawCollectedItem {
  novelty: NoveltyStatus;
}

interface HistoryEntry {
  collectedAt: string;
  items: RawCollectedItem[];
}

interface HistoryFile {
  groupId: string;
  runs: HistoryEntry[];
}

function historyPath(groupId: string): string {
  return path.join(HISTORY_DIR, `${groupId}.json`);
}

function ensureDir() {
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });
}

function loadHistory(groupId: string): HistoryFile {
  ensureDir();
  const p = historyPath(groupId);
  if (!fs.existsSync(p)) return { groupId, runs: [] };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { groupId, runs: [] };
  }
}

function saveHistory(file: HistoryFile) {
  ensureDir();
  fs.writeFileSync(historyPath(file.groupId), JSON.stringify(file, null, 2), { mode: 0o600 });
}

// Compares this run's items against the most recent previous run for the same group, tags
// each item's novelty, then appends this run to the history file (kept indefinitely — it's
// small text, and having the full run-by-run log is the point).
export function diffAgainstHistoryAndSave(groupId: string, items: RawCollectedItem[]): CollectedItemWithNovelty[] {
  const file = loadHistory(groupId);
  const previousRun = file.runs[file.runs.length - 1];
  const previousByUrl = new Map<string, RawCollectedItem>();
  if (previousRun) {
    for (const item of previousRun.items) previousByUrl.set(item.sourceUrl, item);
  }

  const tagged: CollectedItemWithNovelty[] = items.map((item) => {
    const prior = previousByUrl.get(item.sourceUrl);
    let novelty: NoveltyStatus;
    if (!prior) novelty = "new";
    else if (prior.title !== item.title || prior.summary !== item.summary) novelty = "changed";
    else novelty = "unchanged";
    return { ...item, novelty };
  });

  file.runs.push({ collectedAt: new Date().toISOString(), items });
  saveHistory(file);

  return tagged;
}

// [2]장단점 분석/[3]검증 단계가 다시 웹 검색을 하지 않고, [1]단계가 이미 모아서 저장해 둔
// 가장 최근 회차 결과를 그대로 이어받아 쓰기 위한 조회 함수.
export function getLatestRun(groupId: string): { collectedAt: string; items: RawCollectedItem[] } | null {
  const file = loadHistory(groupId);
  const last = file.runs[file.runs.length - 1];
  return last ?? null;
}
