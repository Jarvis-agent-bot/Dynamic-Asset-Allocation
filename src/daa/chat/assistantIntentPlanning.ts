import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

import { parseAssistantIntent } from "./assistantIntentRules";
import type { AssistantPlanningInput, AssistantPlanningResult, DaaAssistantIntent } from "./assistantIntentTypes";

function normalizeUnknown(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractJsonText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return trimmed;
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (mdMatch?.[1]) return mdMatch[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function buildPlannerPrompt(input: AssistantPlanningInput): string {
  return [
    "你是 DAA 本地模拟投资助手的意图路由器与答疑助手。",
    "你的第一任务是判断当前用户输入最适合映射到哪一个动作；当用户在问系统能力、模型路由、权限边界、认知链路时，可直接基于给定上下文回答。",
    "系统只支持本地模拟执行，不支持真实券商交易。",
    "如果系统能力与配置摘要里已经给出答案，不要说自己无法查看；只有在上下文确实缺失时，才明确说明信息不足。",
    input.allowExecution
      ? "当前会话允许执行类动作，但执行类动作后续仍需要系统二次确认。"
      : "当前会话只允许查询和分析，禁止执行类动作。",
    "",
    "允许的 intent 只有这些：",
    "help",
    "brain_status",
    "brain_set_mode",
    "portfolio_status",
    "risk_status",
    "market_status",
    "latest_cycle",
    "agent_run",
    "agent_bootstrap",
    "rebalance_generate",
    "rebalance_execute",
    "confirm_action",
    "cancel_action",
    "trade",
    "thesis_status",
    "agent_briefing",
    "llm_answer",
    "unknown",
    "",
    "规则：",
    "1. 用户要求查看组合/持仓/资产配置，用 portfolio_status。",
    "2. 用户要求看风险、阻断项、风控，用 risk_status。",
    "3. 用户要求看市场状态、行情健康、市场环境，用 market_status。",
    "4. 用户要求看最近一次调仓/周期，用 latest_cycle。",
    "5. 用户在问当前大脑能力、模型路由、系统权限、认知链路，用 brain_status。",
    "6. 用户要求切到顾问 / 操作员 / 自动驾驶模式，用 brain_set_mode。",
    "7. 用户要求运行 / 启动 / 刷新一轮 Agent 调查，用 agent_run。",
    "8. 用户要求初始化论点 / bootstrap thesis，用 agent_bootstrap。",
    "9. 用户要求生成建议、生成调仓、刷新再平衡方案，用 rebalance_generate。",
    "10. 用户要求执行调仓，用 rebalance_execute。",
    "11. 用户说确认/继续/ok，且当前有待确认动作，用 confirm_action。",
    "12. 用户说取消/停止/放弃，且当前有待确认动作，用 cancel_action。",
    "13. 用户明确要买入/卖出某个资产，用 trade；如果数量未给出，qty 和 notional 可都为 null。",
    "14. 用户要求看活跃论点、研究线索、conviction，用 thesis_status。",
    "15. 用户要求看 Agent 日报、自动跟踪项、认知缺口、意外、改观条件，用 agent_briefing。",
    "16. 用户是在追问、解释、分析、复盘、问建议，而不是要触发结构化动作时，用 llm_answer。",
    "17. 如果无法理解，再用 unknown。",
    "18. 当会话不允许执行时，trade / rebalance_execute / confirm_action / agent_bootstrap / brain_set_mode 都不要选，优先 llm_answer。",
    "",
    "请严格输出 JSON，不要输出其他文字：",
    `{
  "intent": "上述 intent 之一",
  "reason": "一句中文解释，40字以内",
  "answer": "仅当 intent=llm_answer 时填写，其余留空字符串",
  "brainMode": "仅当 intent=brain_set_mode 时填写 advisor/operator/autopilot，其余留空字符串",
  "trade": {
    "side": "BUY 或 SELL",
    "symbol": "例如 AAPL",
    "qty": 10,
    "notional": null
  },
  "executeMode": "all"
}`,
    "",
    `当前待确认动作：${input.pendingActionDescription || "无"}`,
    "",
    "当前系统上下文：",
    input.contextDigest || "暂无",
    "",
    "系统能力与配置摘要：",
    input.systemDigest || "暂无",
    "",
    "最近复盘经验：",
    normalizeUnknown(input.learningDigest) || "暂无",
    "",
    "会话摘要：",
    normalizeUnknown(input.sessionSummary) || "暂无",
    "",
    "最近对话：",
    normalizeUnknown(input.recentConversation) || "暂无",
    "",
    `用户输入：${input.userText}`,
  ].join("\n");
}

function parsePlannedIntent(rawUserText: string, rawPlannerText: string): DaaAssistantIntent | null {
  const jsonText = extractJsonText(rawPlannerText);
  if (!jsonText) return null;

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(jsonText);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    parsed = value as Record<string, unknown>;
  } catch (err) {
    logSwallowed("assistantIntentPlanning.parseJson", err);
    return null;
  }

  const intent = normalizeUnknown(parsed.intent).toLowerCase();
  const trade = (parsed.trade && typeof parsed.trade === "object" && !Array.isArray(parsed.trade))
    ? parsed.trade as Record<string, unknown>
    : {};

  switch (intent) {
    case "help":
      return { kind: "help", rawText: rawUserText };
    case "brain_status":
      return { kind: "brain_status", rawText: rawUserText };
    case "brain_set_mode": {
      const mode = normalizeUnknown(parsed.brainMode).toLowerCase();
      if (mode !== "advisor" && mode !== "operator" && mode !== "autopilot") return null;
      return { kind: "brain_set_mode", rawText: rawUserText, mode };
    }
    case "portfolio_status":
      return { kind: "portfolio_status", rawText: rawUserText };
    case "risk_status":
      return { kind: "risk_status", rawText: rawUserText };
    case "market_status":
      return { kind: "market_status", rawText: rawUserText };
    case "latest_cycle":
      return { kind: "latest_cycle", rawText: rawUserText };
    case "agent_run":
      return { kind: "agent_run", rawText: rawUserText };
    case "agent_bootstrap":
      return { kind: "agent_bootstrap", rawText: rawUserText };
    case "rebalance_generate":
      return { kind: "rebalance_generate", rawText: rawUserText };
    case "rebalance_execute":
      return { kind: "rebalance_execute", rawText: rawUserText, executeMode: "all" };
    case "confirm_action":
      return { kind: "confirm_action", rawText: rawUserText };
    case "cancel_action":
      return { kind: "cancel_action", rawText: rawUserText };
    case "trade": {
      const symbol = normalizeUnknown(trade.symbol).toUpperCase();
      const side = normalizeUnknown(trade.side).toUpperCase() === "SELL" ? "SELL" : "BUY";
      const qty = trade.qty == null ? null : Number(trade.qty);
      const notional = trade.notional == null ? null : Number(trade.notional);
      if (!symbol) return null;
      return {
        kind: "trade",
        rawText: rawUserText,
        side,
        symbol,
        qty: Number.isFinite(qty) ? qty : null,
        notional: Number.isFinite(notional) ? notional : null,
      };
    }
    case "thesis_status":
      return { kind: "thesis_status", rawText: rawUserText };
    case "agent_briefing":
      return { kind: "agent_briefing", rawText: rawUserText };
    case "llm_answer":
      return {
        kind: "llm_answer",
        rawText: rawUserText,
        answer: normalizeUnknown(parsed.answer).slice(0, 1600) || null,
      };
    case "unknown":
      return { kind: "unknown", rawText: rawUserText };
    default:
      return null;
  }
}

export async function planAssistantIntent(input: AssistantPlanningInput): Promise<AssistantPlanningResult> {
  const fallback = parseAssistantIntent(input.userText, {
    allowExecution: input.allowExecution,
  });
  try {
    const config = await resolveLlmConfig("decision");
    if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) {
      return { intent: fallback, source: "fallback", plannerRawText: null };
    }
    const prompt = buildPlannerPrompt(input);
    const response = await callLlm(config, prompt);
    const planned = parsePlannedIntent(input.userText, response.text);
    if (!planned) {
      return { intent: fallback, source: "fallback", plannerRawText: response.text || null };
    }
    return { intent: planned, source: "llm", plannerRawText: response.text || null };
  } catch (err) {
    logSwallowed("assistantIntentPlanning.planIntent", err);
    return { intent: fallback, source: "fallback", plannerRawText: null };
  }
}
