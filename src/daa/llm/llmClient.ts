/**
 * llmClient.ts
 *
 * 统一 LLM HTTP 调用层。支持 Chat Completions API 格式。
 *
 * provider 映射：
 * - "deepseek" → https://api.deepseek.com/v1/chat/completions (默认)
 * - "openai"  → https://api.openai.com/v1/chat/completions
 *
 * 凭证解析优先级：env var > DB (secretsManager) > 配置默认值
 */

import { resolveSecret } from "@/src/daa/config/secretsManager";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export { normalizeText, toFinite } from "@/src/daa/utils/normalize";
import { normalizeText, toFinite } from "@/src/daa/utils/normalize";

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

  // Resolve secrets: env > DB > config defaults
  const apiKey = await resolveSecret("llm_api_key");
  const endpoint = await resolveSecret("llm_endpoint");
  const secretModel = await resolveSecret("llm_model");
  const resolvedModel = normalizeText(secretModel, normalizeText(config.model, defaults.model));

  // reasoner 模型推理较慢，强制最低 60s 超时
  const isReasonerModel = resolvedModel.includes("reasoner");
  const minTimeout = isReasonerModel ? 60000 : 2000;
  const defaultTimeout = isReasonerModel ? 90000 : 10000;
  const maxTimeout = isReasonerModel ? 180000 : 30000;
  const timeoutMs = Math.max(minTimeout, Math.min(maxTimeout, Math.trunc(toFinite(config.timeoutMs, defaultTimeout))));

  return {
    enabled: Boolean(config.enabled),
    enabledInDecision: config.enabledInDecision !== false,
    provider,
    model: resolvedModel,
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
 *
 * deepseek-reasoner 系列模型将推理过程放在 `reasoning_content`，
 * 最终结果放在 `content`。若 `content` 为空则回退到 `reasoning_content`。
 */
function extractChatCompletionsText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const parts: string[] = [];
  for (const choice of choices) {
    const message = (choice as Record<string, unknown>)?.message;
    if (message && typeof message === "object") {
      const msg = message as Record<string, unknown>;
      const content = typeof msg.content === "string" ? msg.content.trim() : "";
      const reasoning = typeof msg.reasoning_content === "string" ? msg.reasoning_content.trim() : "";
      // 优先使用 content；若为空则回退到 reasoning_content
      const text = content || reasoning;
      if (text) {
        parts.push(text);
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
    // deepseek-reasoner 系列不支持 temperature 参数
    const isReasoner = config.model.includes("reasoner");
    const body = format === "chat"
      ? JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          ...(isReasoner ? {} : { temperature: 0.3 }),
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
