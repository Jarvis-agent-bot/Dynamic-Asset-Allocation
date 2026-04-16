/**
 * Agent Helpers — LLM 调用封装（含重试 + JSON 提取）
 */

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { estimateTokens } from "@/src/daa/agent/helpers/validation";

/** 判断错误是否可重试（网络错误/超时/429） */
function isRetryableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("enotfound")
    || msg.includes("429") || msg.includes("rate limit") || msg.includes("fetch failed");
}

/**
 * 带重试的 LLM JSON 调用。
 * - 最多重试 2 次（共 3 次尝试），指数退避
 * - 仅对网络/超时/429 错误重试，JSON 解析失败不重试
 */
export async function callDeepSeekJson<T>(prompt: string, scope: string, maxRetries = 2): Promise<{ data: T | null; tokensUsed: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const config = await resolveLlmConfig();
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
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  logSwallowed(scope, lastError);
  return { data: null, tokensUsed: 0 };
}
