/**
 * Agent Helpers — ReAct 响应解析器
 */

import type { InvestigateOutput } from "@/src/daa/agent/cognitiveTypes";

/** ReAct 循环解析：从 LLM 输出中提取 action 类型 */
export type ReactAction =
  | { action: "tool_calls"; tool_calls: Array<{ name: string; params: Record<string, unknown> }>; reasoning?: string }
  | { action: "result"; result: InvestigateOutput };

export function parseReactResponse(data: unknown): ReactAction | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.action === "tool_calls" && Array.isArray(obj.tool_calls)) {
    const validCalls = (obj.tool_calls as Array<Record<string, unknown>>)
      .filter(tc => tc && typeof tc === "object" && typeof tc.name === "string" && tc.name.length > 0)
      .map(tc => ({ name: String(tc.name), params: (tc.params && typeof tc.params === "object" ? tc.params : {}) as Record<string, unknown> }));
    if (validCalls.length === 0) return null;
    return { action: "tool_calls", tool_calls: validCalls, reasoning: typeof obj.reasoning === "string" ? obj.reasoning : undefined };
  }
  if (obj.action === "result" && obj.result && typeof obj.result === "object") {
    return { action: "result", result: obj.result as InvestigateOutput };
  }
  return null;
}
