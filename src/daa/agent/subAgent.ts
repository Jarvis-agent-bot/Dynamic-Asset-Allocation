/**
 * Sub-Agent — 隔离的 ReAct 复核循环
 *
 * 借鉴 Hermes Agent 的子 agent 委派模式：
 * - 父 agent 处理 investigationQueue[0]，子 agent 并行处理 [1..N]
 * - 子 agent 有独立的 ContextManager、受限的工具集、更小的 token 预算
 * - 最大深度 2（子 agent 不能再派生孙 agent）
 * - 父 agent 只看到摘要，不看中间工具调用
 */

import type { ResearchThread, InvestigateOutput, ToolCallRecord, AgentMemory } from "@/src/daa/agent/cognitiveTypes";
import type { PortfolioSnapshot, MarketSnapshot } from "@/src/daa/agent/cognitiveState";
import type { ToolCategory, ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { getToolsByCategory, executeToolCallV2, formatToolDefinitionsV2ForPrompt } from "@/src/daa/agent/tools/registry";
import { ContextManager } from "@/src/daa/agent/context/contextEngine";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { callDeepSeekJson } from "@/src/daa/agent/helpers/llm";
import { parseReactResponse, type ReactAction } from "@/src/daa/agent/helpers/reactParser";

// ── 类型 ──

export interface SubAgentConfig {
  parentRunId: string;
  thread: ResearchThread;
  /** 允许的工具分类（默认排除 act） */
  allowedCategories: ToolCategory[];
  /** 最大 ReAct 轮次（默认 3，比父 agent 少） */
  maxRounds: number;
  /** Token 预算（默认 8000，比父 agent 少） */
  tokenBudget: number;
  /** 委派深度（父=0，子=1，最大=2） */
  depth: number;
  /** 预加载的记忆 */
  memories: AgentMemory[];
  /** 市场快照 */
  market: MarketSnapshot | null;
  /** 组合快照 */
  portfolio: PortfolioSnapshot | null;
}

interface SubAgentResult {
  threadId: string;
  threadTitle: string;
  investigateOutput: InvestigateOutput | null;
  toolsCalled: ToolCallRecord[];
  tokensUsed: number;
  durationMs: number;
  errors: string[];
}

// ── 默认配置 ──

const DEFAULT_SUB_AGENT_CONFIG: Partial<SubAgentConfig> = {
  allowedCategories: ["observe", "analyze", "meta"], // 排除 act
  maxRounds: 3,
  tokenBudget: 8000,
  depth: 1,
};

const MAX_DEPTH = 2;

// ── 主函数 ──

/**
 * 运行一个隔离的子 agent 复核。
 *
 * - 独立 ContextManager（受限预算）
 * - 受限工具集（仅 allowedCategories）
 * - 不执行 reflect/review/surface（只做 investigate）
 * - 永不抛出异常
 */
export async function runSubAgentInvestigation(
  config: SubAgentConfig,
): Promise<SubAgentResult> {
  const t0 = Date.now();
  const cfg = { ...DEFAULT_SUB_AGENT_CONFIG, ...config };
  const errors: string[] = [];
  const toolsCalled: ToolCallRecord[] = [];
  let tokensUsed = 0;

  // 深度检查
  if (cfg.depth! >= MAX_DEPTH) {
    return {
      threadId: cfg.thread.id,
      threadTitle: cfg.thread.title,
      investigateOutput: null,
      toolsCalled: [],
      tokensUsed: 0,
      durationMs: Date.now() - t0,
      errors: [`子 agent 深度超限 (depth=${cfg.depth}, max=${MAX_DEPTH})`],
    };
  }

  try {
    // 构建受限工具列表
    const allowedTools = cfg.allowedCategories!.flatMap(cat => getToolsByCategory(cat));
    const toolDefs = allowedTools.map(t => t.definition);
    const toolDefsText = formatToolDefinitionsV2ForPrompt(toolDefs);

    // 构建上下文
    const memoryText = cfg.memories.length > 0
      ? cfg.memories.map(m => `- [${m.memoryType}] ${m.content.slice(0, 100)}`).join("\n")
      : "无记忆";

    const portfolioText = (cfg.portfolio?.holdings ?? [])
      .filter(h => cfg.thread.assetKeys.includes(h.assetKey))
      .map(h => `${h.assetKey}: ${(h.weightPct * 100).toFixed(1)}%`)
      .join(", ") || "无相关持仓";

    const cm = new ContextManager();
    cm.addLayer("system", "你是一个投资研究子分析师。你的任务是快速复核一个特定投资判断并给出分析结论。");
    cm.addLayer("thesis", `投资判断: ${cfg.thread.title}\n判断: ${cfg.thread.thesisText}\n信念: ${cfg.thread.conviction}\n资产: ${cfg.thread.assetKeys.join(", ")}`);
    cm.addLayer("portfolio", portfolioText);
    cm.addLayer("memory", memoryText, { wrapTag: "memory-context" });
    cm.addLayer("tools", toolDefsText);
    cm.addLayer("rules", `请使用工具收集复核依据，然后给出结论。最多 ${cfg.maxRounds} 轮工具调用。输出严格 JSON。

选择工具: {"action":"tool_calls","tool_calls":[{"name":"...","params":{}}],"reasoning":"..."}
最终结论: {"action":"result","result":{"thesisChanged":true/false,"updatedThesis":"...","newConviction":"high/medium/low/uncertain","evidenceType":"supporting/contradicting/neutral","evidenceSummary":"...","surprises":[],"invalidationConditions":"...","suggestedReviewDays":14,"nextActions":["..."]}}`);

    const toolExecCtx: ToolExecutionContext = { market: cfg.market, portfolio: cfg.portfolio };
    const allResultsV2 = new Map<string, ToolResultV2>();
    const allEvidence: Record<string, unknown> = {};

    // 简化的 ReAct 循环
    let investigateOutput: InvestigateOutput | null = null;

    for (let round = 1; round <= cfg.maxRounds!; round++) {
      const contextResult = cm.build(cfg.tokenBudget!);
      const prompt = contextResult.prompt;

      const { data: reactData, tokensUsed: roundTokens } = await callDeepSeekJson<ReactAction>(
        prompt,
        `subAgent.react.r${round}`,
      );
      tokensUsed += roundTokens;

      // 判断 action
      const parsed = reactData ? parseReactResponse(reactData) : null;
      if (!parsed) {
        errors.push(`子 agent round ${round}: 模型未返回可解析的 ReAct JSON`);
        break;
      }

      if (parsed.action === "result") {
        investigateOutput = parsed.result;
        break;
      }

      if (parsed.action === "tool_calls" && Array.isArray(parsed.tool_calls)) {
        const calls = parsed.tool_calls.slice(0, 3);
        const execPromises = calls.map(async (tc) => {
          const r = await executeToolCallV2(tc.name, tc.params ?? {}, toolExecCtx, allResultsV2);
          return { call: tc, result: r };
        });

        const results = await Promise.allSettled(execPromises);
        const roundSummaryParts: string[] = [];

        for (const settled of results) {
          if (settled.status === "fulfilled") {
            const { call, result: r } = settled.value;
            allResultsV2.set(call.name, r);
            allEvidence[call.name] = r.data;
            toolsCalled.push({
              tool: call.name,
              input: call.params ?? {},
              outputSummary: r.success ? "ok" : (r.error ?? "failed"),
              durationMs: r.latencyMs,
            });
            roundSummaryParts.push(`${call.name}: ${r.success ? JSON.stringify(r.data).slice(0, 200) : r.error}`);
          }
        }

        cm.addToolResultRound(`第${round}轮结果:\n${roundSummaryParts.join("\n")}`);
      }
    }

    if (!investigateOutput && toolsCalled.length > 0) {
      cm.addToolResultRound("所有工具轮次已结束。请立即基于已收集的依据给出最终分析结论（action=result）。只输出 JSON，不要其他文字。");
      const forceContext = cm.build(cfg.tokenBudget!);
      const { data: forceData, tokensUsed: forceTokens } = await callDeepSeekJson<ReactAction>(
        forceContext.prompt,
        "subAgent.react.force",
      );
      tokensUsed += forceTokens;
      const forceParsed = forceData ? parseReactResponse(forceData) : null;
      if (forceParsed?.action === "result") {
        investigateOutput = forceParsed.result;
      } else {
        errors.push("子 agent force: 模型未返回最终结论 JSON");
      }
    }

    // 如果循环结束还没有结论，返回 null
    return {
      threadId: cfg.thread.id,
      threadTitle: cfg.thread.title,
      investigateOutput,
      toolsCalled,
      tokensUsed,
      durationMs: Date.now() - t0,
      errors,
    };
  } catch (e) {
    logSwallowed("subAgent.run", e);
    return {
      threadId: cfg.thread.id,
      threadTitle: cfg.thread.title,
      investigateOutput: null,
      toolsCalled,
      tokensUsed,
      durationMs: Date.now() - t0,
      errors: [...errors, e instanceof Error ? e.message : String(e)],
    };
  }
}
