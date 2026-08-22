// Claude(Anthropic) text/JSON generation helpers — reused as-is from K-Street Evolution
// Director's server.ts (callClaudeMessages/callClaudeText/callClaudeJSON/normalizeStructuredOutput).
// Every pipeline stage that needs AI text (자료 요약, 대본, 후킹 문구, 검증 판단 등) should
// call through these instead of hitting the Anthropic API directly.
import { getEffectiveKey, classifyAnthropicError } from "../../apiKeys.server";

const CLAUDE_MODEL = "claude-sonnet-5";

async function callClaudeMessages(body: Record<string, any>): Promise<any> {
  const { key } = getEffectiveKey("anthropic");
  if (!key) {
    throw new Error("Claude API 키가 설정되어 있지 않습니다. 설정 콘솔에서 등록해주세요.");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Claude API 오류 (HTTP ${res.status})`);
  }
  return data;
}

// Plain free-text generation (no forced structure). `useWebSearch` lets stage [1](자료 수집)
// ground its output in real, cited sources instead of Claude's own knowledge only.
export async function callClaudeText(
  system: string,
  userContent: any,
  opts: { maxTokens?: number; useWebSearch?: boolean } = {}
): Promise<string> {
  const data = await callClaudeMessages({
    max_tokens: opts.maxTokens ?? 4096,
    system,
    messages: [{ role: "user", content: userContent }],
    ...(opts.useWebSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] } : {}),
  });
  const textBlocks = (data.content || []).filter((b: any) => b.type === "text");
  if (!textBlocks.length) throw new Error("Empty response from Claude API");
  return textBlocks.map((b: any) => b.text).join("").trim();
}

// Structured JSON generation via a forced tool call.
export async function callClaudeJSON(
  system: string,
  userContent: any,
  toolName: string,
  inputSchema: Record<string, any>,
  opts: { maxTokens?: number } = {}
): Promise<any> {
  const data = await callClaudeMessages({
    max_tokens: opts.maxTokens ?? 4096,
    system,
    messages: [{ role: "user", content: userContent }],
    tools: [{ name: toolName, description: `Return the result via the ${toolName} tool.`, input_schema: inputSchema }],
    tool_choice: { type: "tool", name: toolName },
  });
  const toolBlock = (data.content || []).find((b: any) => b.type === "tool_use" && b.name === toolName);
  if (!toolBlock?.input) throw new Error("Empty structured response from Claude API");
  return normalizeStructuredOutput(toolBlock.input);
}

// Claude's structured tool-use output occasionally stringifies a nested array/object field
// instead of returning real JSON for it (sometimes double-wrapped) — recover instead of
// crashing downstream on "X.find is not a function".
function normalizeStructuredOutput(input: any): any {
  if (input == null || typeof input !== "object") return input;
  const normalized: any = Array.isArray(input) ? [...input] : { ...input };
  for (const key of Object.keys(normalized)) {
    const value = normalized[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    try {
      let parsed = JSON.parse(trimmed);
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object" && key in parsed) {
        parsed = parsed[key];
      }
      normalized[key] = parsed;
    } catch {
      // leave as-is; caller validates shape and reports a clear error if still wrong
    }
  }
  return normalized;
}

export { classifyAnthropicError };
