/**
 * llmClient.ts
 *
 * 统一 LLM HTTP 调用层。支持两种 API 格式：
 * - OpenAI Chat Completions（DeepSeek、OpenAI /v1/chat/completions）
 * - OpenAI Responses API（/v1/responses）
 *
 * provider 映射：
 * - "deepseek" → Chat Completions，endpoint 默认 https://api.deepseek.com/v1/chat/completions
 * - "openai"  → Chat Completions，endpoint 默认 https://api.openai.com/v1/chat/completions
 * - "codex" / 其他 → Responses API，endpoint 默认 https://api.openai.com/v1/responses
 */

import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LlmRuntimeConfig = {
  enabled: boolean;
  enabledInDecision: boolean;
  provider: string;
  model: string;
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

export function toFinite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider defaults
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, { endpoint: string; model: string; format: "chat" | "responses" }> = {
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    format: "chat",
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    format: "chat",
  },
};

const FALLBACK_DEFAULTS = {
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  format: "chat" as const,
};

function getProviderDefaults(provider: string) {
  return PROVIDER_DEFAULTS[provider] || FALLBACK_DEFAULTS;
}

/** 判断该 provider 使用 Chat Completions 还是 Responses API */
function resolveApiFormat(provider: string, endpoint: string): "chat" | "responses" {
  // 如果 endpoint 包含 /chat/completions，强制用 chat 格式
  if (endpoint.includes("/chat/completions")) return "chat";
  // 如果 endpoint 包含 /responses，强制用 responses 格式
  if (endpoint.includes("/responses")) return "responses";
  // 否则按 provider 默认
  return getProviderDefaults(provider).format;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Resolution
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveLlmConfig(): Promise<LlmRuntimeConfig> {
  const system = await getDaaSystemConfig();
  const config = system.config.dataSources.llmAnalysis;
  const provider = normalizeText(config.provider, "deepseek").toLowerCase();

  const defaults = getProviderDefaults(provider);
  const timeoutMs = Math.max(2000, Math.min(30000, Math.trunc(toFinite(config.timeoutMs, 10000))));

  // Resolve secrets: env > DB > config defaults
  let apiKey = "";
  let endpoint = "";
  let model = "";
  try {
    const { resolveSecret } = await import("@/src/daa/config/secretsManager");
    apiKey = await resolveSecret("llm_api_key");
    endpoint = await resolveSecret("llm_endpoint");
    model = await resolveSecret("llm_model");
  } catch {
    // fallback to env only
    apiKey = normalizeText(process.env.DAA_LLM_API_KEY || process.env.OPENAI_API_KEY);
    endpoint = normalizeText(process.env.DAA_LLM_ENDPOINT);
    model = normalizeText(process.env.DAA_LLM_MODEL);
  }

  return {
    enabled: Boolean(config.enabled),
    enabledInDecision: config.enabledInDecision !== false,
    provider,
    model: normalizeText(model, normalizeText(config.model, defaults.model)),
    endpoint: normalizeText(endpoint, defaults.endpoint),
    apiKey,
    timeoutMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Call
// ─────────────────────────────────────────────────────────────────────────────

export class LlmRequestError extends Error {
  status: number;
  reasonCode: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LlmRequestError";
    this.status = status;
    this.reasonCode = `http_${status}`;
  }
}

/**
 * 从 OpenAI Chat Completions 响应中提取文本。
 * 兼容 DeepSeek、OpenAI、其他 OpenAI 兼容 API。
 */
function extractChatCompletionsText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const parts: string[] = [];
  for (const choice of choices) {
    const message = (choice as Record<string, unknown>)?.message;
    if (message && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string" && content.trim()) {
        parts.push(content.trim());
      }
    }
  }
  return parts.join("\n");
}

/**
 * 从 OpenAI Responses API 响应中提取文本。
 */
function extractResponsesApiText(payload: Record<string, unknown>): string {
  // output_text 快捷字段
  const outputText = normalizeText(payload.output_text);
  if (outputText) return outputText;

  // 遍历 output[].content[].text
  const outputs = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of outputs) {
    const content = Array.isArray((item as Record<string, unknown>)?.content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const block of content) {
      const t = normalizeText((block as Record<string, unknown>)?.text);
      if (t) parts.push(t);
    }
  }
  return parts.join("\n");
}

/**
 * 统一 LLM 调用入口。
 *
 * 自动根据 provider / endpoint 判断使用 Chat Completions 还是 Responses API。
 */
export async function callLlm(
  config: LlmRuntimeConfig,
  prompt: string,
): Promise<{ text: string; raw: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const format = resolveApiFormat(config.provider, config.endpoint);

  try {
    const body = format === "chat"
      ? JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        })
      : JSON.stringify({
          model: config.model,
          input: prompt,
        });

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (config.apiKey) {
      headers.authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body,
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = normalizeText(
        (payload.error as Record<string, unknown>)?.message ?? (payload as Record<string, unknown>).message,
        `HTTP ${response.status}`,
      );
      throw new LlmRequestError(response.status, errMsg);
    }

    const text = format === "chat"
      ? extractChatCompletionsText(payload)
      : extractResponsesApiText(payload);

    return { text, raw: payload };
  } finally {
    clearTimeout(timer);
  }
}
