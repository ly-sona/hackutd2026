import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseEnv } from "node:util";
export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}
export class ModelUnavailable extends Error {}
export function modelConfig(): ModelConfig {
  const root = resolve(
    process.cwd(),
    basename(process.cwd()) === "frontend" ? ".." : ".",
  );
  const path = resolve(root, ".env.local");
  const local = existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
  const get = (key: string) => process.env[key] ?? local[key];
  const baseUrl = get("AEGIS_MODEL_BASE_URL") || "https://api.openai.com/v1";
  const model = get("AEGIS_MODEL_ID") || "gpt-6-luna";
  const apiKey = get("AEGIS_MODEL_API_KEY") || "";
  const url = new URL(baseUrl);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ModelUnavailable(
      "Invalid server-only model endpoint configuration.",
    );
  if (!apiKey && url.hostname === "api.openai.com")
    throw new ModelUnavailable(
      "Model key is not configured. Deterministic results remain available.",
    );
  if (!/^[A-Za-z0-9_./:-]{1,120}$/.test(model))
    throw new ModelUnavailable("Invalid model identifier.");
  return { baseUrl: baseUrl.replace(/\/$/, ""), model, apiKey };
}
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export async function modelTurn(
  config: ModelConfig,
  messages: ChatMessage[],
  tools: unknown[],
): Promise<ToolCall[]> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(40_000),
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        ...(config.model === "gpt-6-luna" ? { reasoning_effort: "none" } : {}),
        messages,
        tools,
        tool_choice: "required",
        parallel_tool_calls: false,
        max_completion_tokens: 2500,
      }),
    });
  } catch {
    throw new ModelUnavailable(
      "Model endpoint unavailable or timed out. Deterministic results remain available.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ModelUnavailable(
      `Model endpoint rejected the request (HTTP ${response.status}). Check server-side model/key configuration.`,
    );
  }
  // Bounded streaming read avoids accepting an unbounded endpoint response.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty model response.");
  let body = "",
    length = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 100_000) {
      await reader.cancel();
      throw new Error("Model response exceeds limit.");
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  const data = JSON.parse(body) as {
    choices?: { message?: { tool_calls?: ToolCall[] } }[];
  };
  const calls = data.choices?.[0]?.message?.tool_calls;
  if (
    !Array.isArray(calls) ||
    !calls.length ||
    calls.length > 3 ||
    calls.some(
      (c) =>
        !c ||
        c.type !== "function" ||
        typeof c.id !== "string" ||
        c.id.length > 150 ||
        !c.function ||
        typeof c.function.name !== "string" ||
        typeof c.function.arguments !== "string" ||
        c.function.arguments.length > 16000,
    )
  )
    throw new Error("Model did not return valid bounded tool calls.");
  return calls;
}
