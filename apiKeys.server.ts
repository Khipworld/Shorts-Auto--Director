// Server-only module: registers/tests/stores external API keys for the settings console.
// Keys are NEVER stored in frontend code or sent back to the client in plaintext.
//
// Adapted from K-Street Evolution Director's apiKeys.server.ts (same encrypted-store
// pattern, console password gate, and per-service test functions) — with a Pexels
// image-search service added for this project's photo sourcing.
//
// Resolution order for any service's "effective" key: encrypted local store > env var.
import type { Express, Request, Response as ExpressResponse, NextFunction } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
const KEY_STORE_PATH = path.join(DATA_DIR, "api-keys.enc.json");
const TEST_STORE_PATH = path.join(DATA_DIR, "api-keys-last-test.json");
const MASTER_KEY_PATH = path.join(DATA_DIR, "encryption.key");
const CONSOLE_PASSWORD_PATH = path.join(DATA_DIR, "console-password.txt");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

function loadEncryptionKey(): Buffer {
  const envKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (envKey && envKey.trim()) {
    const trimmed = envKey.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
    try {
      const b64 = Buffer.from(trimmed, "base64");
      if (b64.length === 32) return b64;
    } catch {
      // fall through to derivation
    }
    return crypto.scryptSync(trimmed, "shorts-auto-director-api-key-store", 32);
  }

  ensureDataDir();
  if (fs.existsSync(MASTER_KEY_PATH)) {
    return Buffer.from(fs.readFileSync(MASTER_KEY_PATH, "utf8").trim(), "hex");
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(MASTER_KEY_PATH, generated.toString("hex"), { mode: 0o600 });
  console.warn(
    "[settings] SETTINGS_ENCRYPTION_KEY 환경변수가 설정되지 않아 임시 암호화 키를 생성해 " +
    ".data/encryption.key 파일에 저장했습니다. 운영 배포에서는 반드시 SETTINGS_ENCRYPTION_KEY를 " +
    "환경변수로 직접 설정하세요 (컨테이너 재배포 시 로컬 파일이 사라지면 저장된 키를 복호화할 수 없습니다)."
  );
  return generated;
}

const ENCRYPTION_KEY = loadEncryptionKey();

const CONSOLE_PASSWORD_FROM_ENV = !!(process.env.SETTINGS_CONSOLE_PASSWORD && process.env.SETTINGS_CONSOLE_PASSWORD.trim());

function loadOrGenerateConsolePassword(): string {
  const envPw = process.env.SETTINGS_CONSOLE_PASSWORD;
  if (envPw && envPw.trim()) return envPw.trim();

  ensureDataDir();
  if (fs.existsSync(CONSOLE_PASSWORD_PATH)) {
    return fs.readFileSync(CONSOLE_PASSWORD_PATH, "utf8").trim();
  }
  const generated = crypto.randomBytes(9).toString("base64url");
  fs.writeFileSync(CONSOLE_PASSWORD_PATH, generated, { mode: 0o600 });
  console.warn(
    `[settings] SETTINGS_CONSOLE_PASSWORD 환경변수가 설정되지 않아 임시 비밀번호를 생성했습니다: "${generated}" ` +
    `(.data/console-password.txt에도 저장됨). 운영 배포에서는 반드시 SETTINGS_CONSOLE_PASSWORD를 직접 설정하세요.`
  );
  return generated;
}

let CONSOLE_PASSWORD = loadOrGenerateConsolePassword();
const CONSOLE_SESSION_TTL_MS = 30 * 60 * 1000;
const consoleSessions = new Map<string, number>();

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufB, bufB);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function issueConsoleSession(): string {
  const token = crypto.randomBytes(24).toString("hex");
  consoleSessions.set(token, Date.now() + CONSOLE_SESSION_TTL_MS);
  return token;
}

function requireConsoleAuth(req: Request, res: ExpressResponse, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const expiresAt = consoleSessions.get(token);
  if (!token || !expiresAt || expiresAt < Date.now()) {
    consoleSessions.delete(token);
    return res.status(401).json({ error: "콘솔 접근 인증이 필요합니다. 비밀번호를 다시 입력해주세요." });
  }
  consoleSessions.set(token, Date.now() + CONSOLE_SESSION_TTL_MS);
  next();
}

interface EncryptedRecord {
  iv: string;
  authTag: string;
  ciphertext: string;
  updatedAt: string;
}

type KeyStore = Record<string, EncryptedRecord>;

export interface UsageInfo {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface LastTestRecord {
  status: "connected" | "error" | "quota_exceeded";
  message: string;
  testedAt: string;
  usage?: UsageInfo | null;
}

type TestStore = Record<string, LastTestRecord>;

function encrypt(plaintext: string): EncryptedRecord {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    updatedAt: new Date().toISOString(),
  };
}

function decrypt(record: EncryptedRecord): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(record.iv, "hex"));
  decipher.setAuthTag(Buffer.from(record.authTag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function loadJson<T>(filePath: string, fallback: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function loadKeyStore(): KeyStore {
  return loadJson<KeyStore>(KEY_STORE_PATH, {});
}
function saveKeyStore(store: KeyStore) {
  saveJson(KEY_STORE_PATH, store);
}
function loadTestStore(): TestStore {
  return loadJson<TestStore>(TEST_STORE_PATH, {});
}
function saveTestStore(store: TestStore) {
  saveJson(TEST_STORE_PATH, store);
}

function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(Math.min(key.length - 8, 24))}${key.slice(-4)}`;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
}

export interface ServiceTestResult {
  status: "connected" | "error" | "quota_exceeded";
  message: string;
  isQuotaError: boolean;
  usage?: UsageInfo | null;
}

interface ServiceDef {
  id: string;
  label: string;
  category: string;
  envVar: string;
  description: string;
  docsUrl: string;
  billingUrl: string;
  supportsUsage: boolean;
  test: (apiKey: string) => Promise<ServiceTestResult>;
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function testAnthropic(apiKey: string): Promise<ServiceTestResult> {
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    });
    if (res.ok) return { status: "connected", message: "Claude API 연결에 성공했습니다.", isQuotaError: false };
    const body = await safeJson(res);
    const msg: string = body?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) return { status: "error", message: "API 키가 유효하지 않습니다 (인증 실패).", isQuotaError: false };
    if (/credit balance/i.test(msg)) return { status: "quota_exceeded", message: msg, isQuotaError: true };
    return { status: "error", message: msg, isQuotaError: false };
  } catch (e: any) {
    return { status: "error", message: e?.message || "네트워크 오류로 연결에 실패했습니다.", isQuotaError: false };
  }
}

async function testOpenAI(apiKey: string): Promise<ServiceTestResult> {
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) return { status: "connected", message: "OpenAI API 연결에 성공했습니다.", isQuotaError: false };
    const body = await safeJson(res);
    const msg: string = body?.error?.message || `HTTP ${res.status}`;
    const code: string = body?.error?.code || "";
    if (res.status === 401) return { status: "error", message: "API 키가 유효하지 않습니다.", isQuotaError: false };
    if (code === "insufficient_quota" || /quota|billing/i.test(msg)) return { status: "quota_exceeded", message: msg, isQuotaError: true };
    return { status: "error", message: msg, isQuotaError: false };
  } catch (e: any) {
    return { status: "error", message: e?.message || "네트워크 오류로 연결에 실패했습니다.", isQuotaError: false };
  }
}

async function testElevenLabs(apiKey: string): Promise<ServiceTestResult> {
  try {
    const res = await fetchWithTimeout("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": apiKey } });
    if (res.ok) {
      const body = await safeJson(res);
      const sub = body?.subscription;
      const usage: UsageInfo | undefined =
        sub && typeof sub.character_count === "number" && typeof sub.character_limit === "number"
          ? { label: "이번 결제 주기 음성 생성 사용량", used: sub.character_count, limit: sub.character_limit, unit: "자" }
          : undefined;
      if (usage && usage.used >= usage.limit) {
        return { status: "quota_exceeded", message: `이번 결제 주기의 음성 생성 크레딧을 모두 소진했습니다. (${usage.used}/${usage.limit}자)`, isQuotaError: true, usage };
      }
      return { status: "connected", message: "ElevenLabs API 연결에 성공했습니다.", isQuotaError: false, usage };
    }
    const body = await safeJson(res);
    const msg: string = body?.detail?.message || body?.detail || `HTTP ${res.status}`;
    if (res.status === 401) return { status: "error", message: "API 키가 유효하지 않습니다.", isQuotaError: false };
    if (/quota|credit/i.test(String(msg))) return { status: "quota_exceeded", message: String(msg), isQuotaError: true };
    return { status: "error", message: String(msg), isQuotaError: false };
  } catch (e: any) {
    return { status: "error", message: e?.message || "네트워크 오류로 연결에 실패했습니다.", isQuotaError: false };
  }
}

async function testNaverClientId(apiKey: string): Promise<ServiceTestResult> {
  const { key: secret } = getEffectiveKey("naver_search_secret");
  if (!secret) return { status: "error", message: "Client Secret도 함께 등록해야 테스트할 수 있습니다.", isQuotaError: false };
  return testNaverSearchPair(apiKey, secret);
}
async function testNaverClientSecret(apiKey: string): Promise<ServiceTestResult> {
  const { key: clientId } = getEffectiveKey("naver_search_id");
  if (!clientId) return { status: "error", message: "Client ID도 함께 등록해야 테스트할 수 있습니다.", isQuotaError: false };
  return testNaverSearchPair(clientId, apiKey);
}
async function testNaverSearchPair(clientId: string, clientSecret: string): Promise<ServiceTestResult> {
  try {
    const res = await fetchWithTimeout(
      "https://naverapihub.apigw.ntruss.com/search/v1/image?" + new URLSearchParams({ query: "test", display: "1" }),
      { headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret } }
    );
    if (res.ok) return { status: "connected", message: "네이버 이미지 검색 API 연결에 성공했습니다.", isQuotaError: false };
    const body = await safeJson(res);
    const msg: string = body?.errorMessage || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) return { status: "error", message: msg || "Client ID/Secret이 유효하지 않습니다.", isQuotaError: false };
    if (res.status === 429) return { status: "quota_exceeded", message: "일일 호출 한도를 초과했습니다.", isQuotaError: true };
    return { status: "error", message: msg, isQuotaError: false };
  } catch (e: any) {
    return { status: "error", message: e?.message || "네트워크 오류로 연결에 실패했습니다.", isQuotaError: false };
  }
}

async function testUnsplash(apiKey: string): Promise<ServiceTestResult> {
  try {
    const res = await fetchWithTimeout("https://api.unsplash.com/photos/random?count=1", { headers: { Authorization: `Client-ID ${apiKey}` } });
    const limitHeader = res.headers.get("x-ratelimit-limit");
    const remaining = res.headers.get("x-ratelimit-remaining");
    const usage: UsageInfo | undefined =
      limitHeader && remaining ? { label: "시간당 요청 한도", used: Number(limitHeader) - Number(remaining), limit: Number(limitHeader), unit: "회" } : undefined;
    if (res.ok) return { status: "connected", message: "Unsplash API 연결에 성공했습니다.", isQuotaError: false, usage };
    const body = await safeJson(res);
    const msg: string = Array.isArray(body?.errors) ? body.errors.join(", ") : `HTTP ${res.status}`;
    if (remaining === "0" || /rate limit/i.test(msg)) return { status: "quota_exceeded", message: "시간당 요청 한도(Rate Limit)를 초과했습니다.", isQuotaError: true, usage };
    if (res.status === 401 || res.status === 403) return { status: "error", message: msg || "API 키가 유효하지 않습니다.", isQuotaError: false };
    return { status: "error", message: msg, isQuotaError: false };
  } catch (e: any) {
    return { status: "error", message: e?.message || "네트워크 오류로 연결에 실패했습니다.", isQuotaError: false };
  }
}

// Pexels: second stock-photo source alongside Unsplash (사용자 요청으로 신규 추가) — a plain
// single API key in the request header, no OAuth/pair like Naver needs.
async function testPexels(apiKey: string): Promise<ServiceTestResult> {
  try {
    const res = await fetchWithTimeout("https://api.pexels.com/v1/search?query=test&per_page=1", { headers: { Authorization: apiKey } });
    const limitHeader = res.headers.get("x-ratelimit-limit");
    const remaining = res.headers.get("x-ratelimit-remaining");
    const usage: UsageInfo | undefined =
      limitHeader && remaining ? { label: "이번 달 요청 한도", used: Number(limitHeader) - Number(remaining), limit: Number(limitHeader), unit: "회" } : undefined;
    if (res.ok) return { status: "connected", message: "Pexels API 연결에 성공했습니다.", isQuotaError: false, usage };
    if (res.status === 401) return { status: "error", message: "API 키가 유효하지 않습니다.", isQuotaError: false };
    if (res.status === 429 || remaining === "0") return { status: "quota_exceeded", message: "요청 한도를 초과했습니다.", isQuotaError: true, usage };
    return { status: "error", message: `HTTP ${res.status}`, isQuotaError: false };
  } catch (e: any) {
    return { status: "error", message: e?.message || "네트워크 오류로 연결에 실패했습니다.", isQuotaError: false };
  }
}

const SERVICES: ServiceDef[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    category: "AI 대본/텍스트 생성",
    envVar: "ANTHROPIC_API_KEY",
    description: "자료 요약, 대본, 후킹 문구 등 텍스트 생성에 사용되는 Anthropic Claude API 키입니다.",
    docsUrl: "https://console.anthropic.com/settings/keys",
    billingUrl: "https://console.anthropic.com/settings/billing",
    supportsUsage: false,
    test: testAnthropic,
  },
  {
    id: "openai_image",
    label: "이미지 생성 (OpenAI)",
    category: "AI 이미지 생성",
    envVar: "OPENAI_API_KEY",
    description: "실사진을 못 찾은 장면의 이미지 자동 생성을 위한 OpenAI API 키입니다.",
    docsUrl: "https://platform.openai.com/api-keys",
    billingUrl: "https://platform.openai.com/settings/organization/billing/overview",
    supportsUsage: false,
    test: testOpenAI,
  },
  {
    id: "elevenlabs",
    label: "음원/음성 생성 (ElevenLabs)",
    category: "AI 음성/음원 생성",
    envVar: "ELEVENLABS_API_KEY",
    description: "나레이션 음성 및 배경 음원 생성을 위한 ElevenLabs API 키입니다. (K-Street의 Coqui XTTS-v2는 비영리 전용 라이선스라 실제 배포용 콘텐츠에는 이 서비스를 우선 검토)",
    docsUrl: "https://elevenlabs.io/app/settings/api-keys",
    billingUrl: "https://elevenlabs.io/app/subscription",
    supportsUsage: true,
    test: testElevenLabs,
  },
  {
    id: "unsplash",
    label: "Unsplash",
    category: "사진 검색",
    envVar: "UNSPLASH_ACCESS_KEY",
    description: "자료 수집 단계에서 쓰는 실사진 검색 소스 1순위 Unsplash Access Key입니다.",
    docsUrl: "https://unsplash.com/oauth/applications",
    billingUrl: "https://unsplash.com/developers",
    supportsUsage: true,
    test: testUnsplash,
  },
  {
    id: "pexels",
    label: "Pexels",
    category: "사진 검색",
    envVar: "PEXELS_API_KEY",
    description: "Unsplash에서 못 찾은 사진을 위한 두 번째 스톡 사진 검색 소스입니다.",
    docsUrl: "https://www.pexels.com/api/",
    billingUrl: "https://www.pexels.com/api/",
    supportsUsage: true,
    test: testPexels,
  },
  {
    id: "naver_search_id",
    label: "네이버 이미지 검색 - Client ID",
    category: "사진 검색",
    envVar: "NAVER_SEARCH_CLIENT_ID",
    description: "국내 인물/이슈/장소 등 Unsplash·Pexels에서 못 찾은 사진을 위한 국내 안전망. NAVER API HUB에서 발급받은 Client ID (X-NCP-APIGW-API-KEY-ID).",
    docsUrl: "https://developers.naver.com/products/service-api/search/search.md",
    billingUrl: "https://console.ncloud.com/billing",
    supportsUsage: false,
    test: testNaverClientId,
  },
  {
    id: "naver_search_secret",
    label: "네이버 이미지 검색 - Client Secret",
    category: "사진 검색",
    envVar: "NAVER_SEARCH_CLIENT_SECRET",
    description: "위 Client ID와 짝을 이루는 Client Secret (X-NCP-APIGW-API-KEY).",
    docsUrl: "https://developers.naver.com/products/service-api/search/search.md",
    billingUrl: "https://console.ncloud.com/billing",
    supportsUsage: false,
    test: testNaverClientSecret,
  },
];

export function getEffectiveKey(id: string): { key: string | null; source: "stored" | "env" | "none" } {
  const store = loadKeyStore();
  const rec = store[id];
  if (rec) {
    try {
      return { key: decrypt(rec), source: "stored" };
    } catch (e) {
      console.error(`[settings] Failed to decrypt stored key for "${id}":`, e);
    }
  }
  const def = SERVICES.find((s) => s.id === id);
  const envVal = def ? process.env[def.envVar] : undefined;
  if (envVal && envVal.trim()) return { key: envVal.trim(), source: "env" };
  return { key: null, source: "none" };
}

export function classifyAnthropicError(message: string): { isQuotaError: boolean; billingUrl?: string } {
  if (/credit balance|rate_limit|429/i.test(message)) {
    return { isQuotaError: true, billingUrl: SERVICES.find((s) => s.id === "anthropic")!.billingUrl };
  }
  return { isQuotaError: false };
}

export function classifyUnsplashError(status: number, message: string): { isQuotaError: boolean; billingUrl?: string } {
  if (status === 403 && /rate limit/i.test(message)) {
    return { isQuotaError: true, billingUrl: SERVICES.find((s) => s.id === "unsplash")!.billingUrl };
  }
  return { isQuotaError: false };
}

export function registerApiKeyRoutes(app: Express) {
  app.post("/api/settings/auth", (req: Request, res: ExpressResponse) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !timingSafeStringEqual(password, CONSOLE_PASSWORD)) {
      return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
    }
    const token = issueConsoleSession();
    return res.json({ token, expiresInMs: CONSOLE_SESSION_TTL_MS, passwordFromEnv: CONSOLE_PASSWORD_FROM_ENV });
  });

  app.post("/api/settings/auth/change-password", requireConsoleAuth, (req: Request, res: ExpressResponse) => {
    if (CONSOLE_PASSWORD_FROM_ENV) {
      return res.status(400).json({ error: "비밀번호가 SETTINGS_CONSOLE_PASSWORD 환경변수로 고정되어 있어 콘솔에서 변경할 수 없습니다. 환경변수를 수정해주세요." });
    }
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || !timingSafeStringEqual(currentPassword, CONSOLE_PASSWORD)) {
      return res.status(400).json({ error: "현재 비밀번호가 올바르지 않습니다." });
    }
    if (typeof newPassword !== "string" || newPassword.trim().length < 8) {
      return res.status(400).json({ error: "새 비밀번호는 8자 이상이어야 합니다." });
    }
    CONSOLE_PASSWORD = newPassword.trim();
    ensureDataDir();
    fs.writeFileSync(CONSOLE_PASSWORD_PATH, CONSOLE_PASSWORD, { mode: 0o600 });
    return res.json({ ok: true });
  });

  app.get("/api/settings/api-keys", requireConsoleAuth, (_req: Request, res: ExpressResponse) => {
    const testStore = loadTestStore();
    const services = SERVICES.map((svc) => {
      const { key, source } = getEffectiveKey(svc.id);
      return {
        id: svc.id,
        label: svc.label,
        category: svc.category,
        description: svc.description,
        envVar: svc.envVar,
        docsUrl: svc.docsUrl,
        billingUrl: svc.billingUrl,
        supportsUsage: svc.supportsUsage,
        hasKey: !!key,
        source,
        maskedKey: key ? maskApiKey(key) : null,
        lastTest: testStore[svc.id] ?? null,
      };
    });
    res.json({ services });
  });

  app.put("/api/settings/api-keys/:id", requireConsoleAuth, (req: Request, res: ExpressResponse) => {
    const svc = SERVICES.find((s) => s.id === req.params.id);
    if (!svc) return res.status(404).json({ error: "알 수 없는 서비스입니다." });
    const { apiKey } = req.body ?? {};
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return res.status(400).json({ error: "API 키를 입력해주세요." });
    }
    const store = loadKeyStore();
    store[svc.id] = encrypt(apiKey.trim());
    saveKeyStore(store);
    const testStore = loadTestStore();
    delete testStore[svc.id];
    saveTestStore(testStore);
    return res.json({ ok: true, maskedKey: maskApiKey(apiKey.trim()) });
  });

  app.delete("/api/settings/api-keys/:id", requireConsoleAuth, (req: Request, res: ExpressResponse) => {
    const svc = SERVICES.find((s) => s.id === req.params.id);
    if (!svc) return res.status(404).json({ error: "알 수 없는 서비스입니다." });
    const store = loadKeyStore();
    delete store[svc.id];
    saveKeyStore(store);
    const testStore = loadTestStore();
    delete testStore[svc.id];
    saveTestStore(testStore);
    return res.json({ ok: true });
  });

  app.post("/api/settings/api-keys/:id/test", requireConsoleAuth, async (req: Request, res: ExpressResponse) => {
    const svc = SERVICES.find((s) => s.id === req.params.id);
    if (!svc) return res.status(404).json({ error: "알 수 없는 서비스입니다." });
    const { key, source } = getEffectiveKey(svc.id);
    if (!key) {
      return res.status(400).json({ status: "error", message: "등록된 API 키가 없습니다. 먼저 키를 저장해주세요.", isQuotaError: false, source });
    }
    const result = await svc.test(key);
    const testedAt = new Date().toISOString();
    const testStore = loadTestStore();
    testStore[svc.id] = { status: result.status, message: result.message, testedAt, usage: result.usage ?? null };
    saveTestStore(testStore);
    return res.json({ ...result, source, testedAt, billingUrl: result.isQuotaError ? svc.billingUrl : undefined });
  });
}
