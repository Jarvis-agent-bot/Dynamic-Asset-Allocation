/**
 * Agent Helpers — LLM 调用封装（含重试 + JSON 提取 + 多模型路由）
 *
 * 借鉴 Hermes Agent 的多模型路由：不同任务用不同模型。
 *
 * Tier 定义：
 * - fast: 便宜/快速模型，用于 observe 数据整理、上下文摘要压缩、优先级排序
 * - strong: 主力/贵模型，用于 investigate 推理、reflect 反思、review 复盘、surface 日报
 *
 * 路由逻辑：
 * - strong tier → 使用系统配置的主 LLM（resolveLlmConfig）
 * - fast tier → 优先用 deepseek-chat（$0.14/$0.28/M），fallback 到主 LLM
 */

import { callLlm, resolveLlmConfig, type LlmRuntimeConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { estimateTokens } from "@/src/daa/agent/helpers/validation";

// ── 多模型路由 ──

/**
 * LLM 任务分级：
 * - fast: 数据整理、摘要、格式化（不需要深度推理）
 * - strong: 投资分析、决策、反思（需要复杂推理）
 */
export type LlmTaskTier = "fast" | "strong";

/** fast tier 的默认配置（DeepSeek Chat，最便宜） */
const FAST_TIER_DEFAULTS = {
  provider: "deepseek",
  model: "deepseek-chat",
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  timeoutMs: 15000,
};

/**
 * 解析指定 tier 的 LLM 配置。
 *
 * - strong: 直接使用系统配置的主 LLM
 * - fast: 优先使用 DeepSeek Chat（便宜），fallback 到主 LLM
 */
export async function resolveLlmConfigForTier(tier: LlmTaskTier): Promise<LlmRuntimeConfig | null> {
  const primaryConfig = await resolveLlmConfig(tier === "strong" ? "research" : "analysis");
  if (!primaryConfig) return null;

  if (tier === "strong") {
    return primaryConfig;
  }

  // fast tier: 如果主 LLM 已经是 deepseek-chat，直接用
  if (primaryConfig.provider === "deepseek" && primaryConfig.model === "deepseek-chat") {
    return primaryConfig;
  }

  // fast tier: 尝试构建 DeepSeek Chat 配置（复用主 LLM 的 key）
  // 如果主 provider 不是 deepseek，看有没有 deepseek key
  try {
    const { resolveSecret } = await import("@/src/daa/config/secretsManager");
    const deepseekKey = await resolveSecret("llm_api_key_deepseek");
    if (deepseekKey) {
      return {
        ...primaryConfig,
        provider: FAST_TIER_DEFAULTS.provider,
        model: FAST_TIER_DEFAULTS.model,
        endpoint: FAST_TIER_DEFAULTS.endpoint,
        apiKey: deepseekKey,
        timeoutMs: FAST_TIER_DEFAULTS.timeoutMs,
      };
    }
  } catch {
    // ignore — fallback to primary
  }

  // fallback: 没有独立 deepseek key，用主 LLM
  return primaryConfig;
}

// ── 重试逻辑 ──

/** 判断错误是否可重试（网络错误/超时/429） */
function isRetryableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("enotfound")
    || msg.includes("429") || msg.includes("rate limit") || msg.includes("fetch failed");
}

// ── 核心调用 ──

/**
 * 带重试的 LLM JSON 调用（支持多模型路由）。
 *
 * @param prompt — LLM prompt
 * @param scope — 日志 scope（如 "prioritizeNode"）
 * @param opts.tier — 任务分级（默认 "strong"）
 * @param opts.maxRetries — 最大重试次数（默认 2）
 */
export async function callDeepSeekJson<T>(
  prompt: string,
  scope: string,
  opts?: { tier?: LlmTaskTier; maxRetries?: number } | number,
): Promise<{ data: T | null; tokensUsed: number }> {
  // 兼容旧调用签名 callDeepSeekJson(prompt, scope, 2)
  const maxRetries = typeof opts === "number" ? opts : (opts?.maxRetries ?? 2);
  const tier: LlmTaskTier = typeof opts === "object" && opts?.tier ? opts.tier : "strong";

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const config = await resolveLlmConfigForTier(tier);
      if (!config) return { data: null, tokensUsed: 0 };
      const { text } = await callLlm(config, prompt);
      // 从 markdown code block 或纯 JSON 中提取
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        logSwallowed(`${scope}.noJson`, new Error("LLM 输出中未找到 JSON"));
        return { data: null, tokensUsed: estimateTokens(prompt + text) };
      }
      const parsed = JSON.parse(jsonMatch[1].trim()) as T;
      return { data: parsed, tokensUsed: estimateTokens(prompt + text) };
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries && isRetryableError(e)) {
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  logSwallowed(scope, lastError);
  return { data: null, tokensUsed: 0 };
}

/**
 * 纯文本 LLM 调用（不做 JSON 提取，用于摘要压缩等）。
 *
 * 默认使用 fast tier（摘要不需要强推理模型）。
 */
export async function callLlmText(
  prompt: string,
  scope: string,
  tier: LlmTaskTier = "fast",
): Promise<{ text: string; tokensUsed: number }> {
  try {
    const config = await resolveLlmConfigForTier(tier);
    if (!config) return { text: "", tokensUsed: 0 };
    const { text } = await callLlm(config, prompt);
    return { text, tokensUsed: estimateTokens(prompt + text) };
  } catch (e) {
    logSwallowed(scope, e);
    return { text: "", tokensUsed: 0 };
  }
}
