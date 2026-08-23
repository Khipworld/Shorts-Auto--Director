// 작업 기록 — 사용자가 무엇을 요청했고 어떻게 대응했는지 남기는 이력.
// 대화 세션은 끊기면 사라지지만 이 파일은 남기 때문에, 프로젝트에서 유일하게 신뢰할 수 있는
// 작업 이력이다.
//
// K-Street(`C:\Claude_Project\worklog.server.ts`)에 있던 기능을 이 프로젝트로 가져온 것.
// 사용자 지시: "K-Street 서버가 아니라 그 기능만 가져와서 여기서 새로 작성해야 한다."
//
// 기록 규칙(사용자가 K-Street에서 정한 것을 그대로 따름):
//  - 한 턴에 한 건. 여러 턴을 뭉쳐서 요약하지 말 것.
//  - userRequest는 사용자가 쓴 원문 그대로. 내가 다시 쓴 요약문을 넣지 말 것.
//  - aiResponse는 실제로 한 일. 하겠다고 한 것 말고 한 것.
//  - commit은 실제로 커밋한 경우에만 해시를 적고, 아니면 "(미커밋)".
//
// API 키 콘솔과 달리 비밀번호 없이 열어둔다 — 비밀 정보가 아니다.
import type { Express, Request, Response as ExpressResponse } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
const WORK_LOG_PATH = path.join(DATA_DIR, "work-log.json");

// 이 저장소의 첫 커밋 날짜 — 기록이 실수로 덮어쓰지 못하게 고정값으로 둔다.
const PROJECT_START_DATE = "2026-08-22";

export interface WorkLogImplementation {
  githubFolder: string;
  commit: string;
  commitMessage: string;
  files: string[];
}

export interface WorkLogEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  userRequest: string;
  aiResponse: string;
  implementation: WorkLogImplementation;
}

interface WorkLogStore {
  projectStartDate: string;
  entries: WorkLogEntry[];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

function loadStore(): WorkLogStore {
  ensureDataDir();
  if (!fs.existsSync(WORK_LOG_PATH)) {
    return { projectStartDate: PROJECT_START_DATE, entries: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(WORK_LOG_PATH, "utf8"));
    return {
      projectStartDate: raw.projectStartDate || PROJECT_START_DATE,
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    };
  } catch (e) {
    console.error("[worklog] work-log.json을 읽지 못해 새로 시작합니다:", e);
    return { projectStartDate: PROJECT_START_DATE, entries: [] };
  }
}

function saveStore(store: WorkLogStore) {
  ensureDataDir();
  fs.writeFileSync(WORK_LOG_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function nowParts(): { date: string; time: string } {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  return { date, time };
}

function toImplementation(input: any): WorkLogImplementation {
  return {
    githubFolder: typeof input?.githubFolder === "string" ? input.githubFolder : "",
    commit: typeof input?.commit === "string" ? input.commit : "",
    commitMessage: typeof input?.commitMessage === "string" ? input.commitMessage : "",
    files: Array.isArray(input?.files) ? input.files.filter((f: any) => typeof f === "string") : [],
  };
}

export function registerWorkLogRoutes(app: Express) {
  app.get("/api/worklog", (_req: Request, res: ExpressResponse) => {
    const store = loadStore();
    const entries = [...store.entries].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    return res.json({ projectStartDate: store.projectStartDate, entries });
  });

  app.post("/api/worklog", (req: Request, res: ExpressResponse) => {
    const body = req.body ?? {};
    // 여러 건을 한 번에 넣을 수 있게 배열도 받는다 — 하루치를 몰아서 기록할 때 쓴다.
    const incoming: any[] = Array.isArray(body.entries) ? body.entries : [body];

    const store = loadStore();
    const added: WorkLogEntry[] = [];
    for (const item of incoming) {
      if (typeof item?.userRequest !== "string" || !item.userRequest.trim()) {
        return res.status(400).json({ error: "userRequest 값이 필요합니다." });
      }
      if (typeof item?.aiResponse !== "string" || !item.aiResponse.trim()) {
        return res.status(400).json({ error: "aiResponse 값이 필요합니다." });
      }
      const { date: nowDate, time: nowTime } = nowParts();
      const entry: WorkLogEntry = {
        id: crypto.randomUUID(),
        date: typeof item.date === "string" && item.date.trim() ? item.date.trim() : nowDate,
        time: typeof item.time === "string" && item.time.trim() ? item.time.trim() : nowTime,
        userRequest: item.userRequest.trim(),
        aiResponse: item.aiResponse.trim(),
        implementation: toImplementation(item.implementation),
      };
      store.entries.push(entry);
      added.push(entry);
    }
    saveStore(store);
    return res.json({ ok: true, added: added.length, entries: added });
  });

  app.delete("/api/worklog/:id", (req: Request, res: ExpressResponse) => {
    const store = loadStore();
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.id !== req.params.id);
    if (store.entries.length === before) {
      return res.status(404).json({ error: "해당 기록을 찾을 수 없습니다." });
    }
    saveStore(store);
    return res.json({ ok: true });
  });

  app.delete("/api/worklog", (_req: Request, res: ExpressResponse) => {
    saveStore({ projectStartDate: loadStore().projectStartDate, entries: [] });
    return res.json({ ok: true });
  });
}
