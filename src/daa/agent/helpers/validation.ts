/**
 * Agent Helpers — 纯函数校验工具
 *
 * 被多个节点共享，无副作用，无外部依赖。
 */

/** 粗略估计 token 数（中文约 1.5 token/字，英文约 0.75 token/词） */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.5);
}

/**
 * 轻量 JSON shape 校验。检查必填 key 是否存在且类型匹配。
 * @returns 错误消息数组，空数组表示通过
 */
export function validateShape(
  data: unknown,
  schema: Record<string, "string" | "number" | "boolean" | "array" | "object">,
): string[] {
  if (data == null || typeof data !== "object") return ["data is null or not an object"];
  const obj = data as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, expectedType] of Object.entries(schema)) {
    const val = obj[key];
    if (val === undefined || val === null) {
      errors.push(`缺少必填字段: ${key}`);
      continue;
    }
    if (expectedType === "array" && !Array.isArray(val)) {
      errors.push(`字段 ${key} 应为 array，实际为 ${typeof val}`);
    } else if (expectedType === "object" && (typeof val !== "object" || Array.isArray(val))) {
      errors.push(`字段 ${key} 应为 object，实际为 ${typeof val}`);
    } else if (expectedType !== "array" && expectedType !== "object" && typeof val !== expectedType) {
      errors.push(`字段 ${key} 应为 ${expectedType}，实际为 ${typeof val}`);
    }
  }
  return errors;
}

/** 检查当前 cycle 是否应该触发熔断（连续 LLM 失败过多） */
export function shouldCircuitBreak(errors: string[], threshold = 3): boolean {
  // 同时覆盖 LLM 业务错误与网络/限流层失败，避免「DeepSeek/LLM/noJson」之外的
  // 连续网络失败（timeout/429/ECONNRESET 等）漏计而触发不了熔断。
  const llmFailurePattern = /deepseek|llm|nojson|timeout|timed out|econnreset|econnrefused|etimedout|socket hang up|network|fetch failed|abort|rate limit|429|502|503|too many requests/i;
  const llmFailures = errors.filter((e) => llmFailurePattern.test(e)).length;
  return llmFailures >= threshold;
}
