/**
 * Cognitive Agent — Investigate 节点（Phase 3: ReAct 循环 — LLM 自主选择工具）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import type { InvestigateOutput, ToolCallRecord } from "@/src/daa/agent/cognitiveTypes";
import { buildReactInvestigatePromptSections, buildReactFollowUpPrompt, buildInvestigatePrompt } from "@/src/daa/agent/cognitivePrompts";
import { createInvestigateContextManager } from "@/src/daa/agent/context/contextEngine";
import { callDeepSeekJson } from "@/src/daa/agent/helpers/llm";
import { validateShape, shouldCircuitBreak } from "@/src/daa/agent/helpers/validation";
import { parseReactResponse } from "@/src/daa/agent/helpers/reactParser";
import type { ReactAction } from "@/src/daa/agent/helpers/reactParser";

// ── Tool System V2（Hermes 模式）──
import {
  getToolDefinitions,
  executeToolCallV2,
  formatToolDefinitionsV2ForPrompt,
} from "@/src/daa/agent/tools/registry";
import type { ToolResultV2, ToolExecutionContext } from "@/src/daa/agent/tools/types";

import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function investigateNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  const target = state.currentTarget;
  const thread = state.currentThread;

  if (!target || !thread) {
    return { investigateResult: null }; // 无目标，清除 stale 结果
  }

  try {
    // 熔断检查（读取配置阈值）
    if (shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      return { errors: ["investigate: 熔断 — 连续 LLM 失败次数过多，跳过"] };
    }

    // Phase 4: 子 agent 并行调查（父处理 item[0]，子 agent 并行处理 item[1..N]）
    const subAgentResultsForState: CognitiveUpdate["subAgentResults"] = [];
    if (state.investigationQueue.length > 1) {
      try {
        const { runSubAgentInvestigation } = await import("@/src/daa/agent/subAgent");
        const remainingTargets = state.investigationQueue.slice(1);

        // 为每个剩余 target 加载 thread 并派生子 agent
        const subAgentPromises = remainingTargets.map(async (t) => {
          if (!t.threadId) return null;
          const subThread = await thesisStore.getThesisById(t.threadId);
          if (!subThread) return null;

          // 子 agent 共享父 agent 的记忆和快照，但工具受限
          return runSubAgentInvestigation({
            parentRunId: `parent_${Date.now()}`,
            thread: subThread,
            allowedCategories: ["observe", "analyze", "meta"], // 不允许 act
            maxRounds: 3,
            tokenBudget: 8000,
            depth: 1,
            memories: [], // 子 agent 不继承父 agent 的记忆检索（各自独立）
            market: state.market,
            portfolio: state.portfolio,
          });
        });

        const settled = await Promise.allSettled(subAgentPromises);
        for (const s of settled) {
          if (s.status === "fulfilled" && s.value) {
            const r = s.value;
            subAgentResultsForState.push({
              threadId: r.threadId,
              threadTitle: r.threadTitle,
              summary: r.investigateOutput?.evidenceSummary ?? "无结论",
              thesisChanged: r.investigateOutput?.thesisChanged ?? false,
              toolsUsed: r.toolsCalled.map(tc => tc.tool),
              tokensUsed: r.tokensUsed,
            });

            // 子 agent 的 thesis 更新和证据写入
            if (r.investigateOutput?.thesisChanged && r.investigateOutput.updatedThesis) {
              await thesisStore.updateThesis(r.threadId, {
                thesisText: r.investigateOutput.updatedThesis,
                conviction: r.investigateOutput.newConviction ?? undefined,
              });
            }
            if (r.investigateOutput?.evidenceSummary) {
              await thesisStore.addEvidence({
                threadId: r.threadId,
                evidenceType: r.investigateOutput.evidenceType ?? "neutral",
                source: "agent_reasoning",
                content: `[子agent] ${r.investigateOutput.evidenceSummary}`,
              });
            }
          }
        }
      } catch (e) {
        logSwallowed("cognitiveGraph.investigate.subAgents", e);
      }
    }

    const maxRounds = state.agentConfig?.maxReactRounds ?? 5;
    const allToolsCalled: ToolCallRecord[] = [];
    const allEvidence: Record<string, unknown> = {};
    let totalTokens = 0;

    // 检索相关记忆（在 ReAct 循环开始前）
    const queryEmb = await generateEmbedding(thread.title + " " + thread.thesisText);
    const memories = await memoryStore.recallMemory({
      queryEmbedding: queryEmb,
      tags: [thread.id, ...thread.tags],
      limit: state.agentConfig?.memoryRecallLimit ?? 5,
    });

    // V2: 工具执行上下文（注入 state-dependent 数据，所有 V2 工具共享）
    const toolExecCtx: ToolExecutionContext = {
      market: state.market,
      portfolio: state.portfolio,
    };
    // V2: 累积工具结果（支持链式引用 $tool_results.xxx.field）
    const allToolResultsV2 = new Map<string, ToolResultV2>();

    // ── ReAct 循环 ──
    // 第一轮：发送初始 prompt（含工具定义 + thesis + memories）
    // 2C: 加载该 thesis 的 trade_outcome 证据
    let tradeOutcomes: Array<{ content: string; evidenceType: string; createdAt: string }> = [];
    try {
      const thesisWithEvidence = await thesisStore.getThesisWithEvidence(thread.id);
      const evidence = thesisWithEvidence?.evidence ?? [];
      tradeOutcomes = evidence
        .filter(e => e.source === "trade_outcome")
        .slice(0, 5)
        .map(e => ({ content: e.content, evidenceType: e.evidenceType, createdAt: e.createdAt }));
    } catch (e) {
      logSwallowed("cognitiveGraph.investigate.tradeOutcomes", e);
    }

    // V2: 使用分类工具定义（含 outputSchema 提示链式引用）
    const toolDefsForPrompt = formatToolDefinitionsV2ForPrompt(getToolDefinitions());

    // V2 Context Engine: 构建结构化段落 + ContextManager（替代旧的 MAX_PROMPT_CHARS 手动拼接）
    // Phase 2: 构建策略提示文本（如果有匹配策略）
    const strategyHintText = (state.matchedStrategies ?? []).length > 0
      ? (state.matchedStrategies ?? []).map(s =>
          `策略「${s.name}」(成功率 ${(s.successRate * 100).toFixed(0)}%): ${s.promptTemplate}\n推荐工具: ${s.toolSequence.join(" → ")}`,
        ).join("\n\n")
      : "";

    const promptSections = buildReactInvestigatePromptSections({
      thread,
      toolDefinitionsV2Text: toolDefsForPrompt,
      memories,
      portfolio: state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 },
      tradeOutcomes,
    });
    const contextManager = createInvestigateContextManager({
      ...promptSections,
      strategy: strategyHintText,
    });

    let result: InvestigateOutput | null = null;
    const CONTEXT_BUDGET_TOKENS = 12000; // Context Engine 管理的 token 预算

    for (let round = 1; round <= maxRounds; round++) {
      // V2: ContextManager 自动处理滑动窗口 + 分层预算（替代旧的手动截断）
      const contextResult = contextManager.build(CONTEXT_BUDGET_TOKENS);
      const currentPrompt = contextResult.prompt;

      const { data: reactData, tokensUsed } = await callDeepSeekJson<ReactAction>(
        currentPrompt,
        `cognitiveGraph.investigate.react.r${round}`,
      );
      totalTokens += tokensUsed;

      if (!reactData) {
        logSwallowed("cognitiveGraph.investigate.react.noResponse", new Error(`ReAct 第 ${round} 轮无响应`));
        break;
      }

      const action = parseReactResponse(reactData);
      if (!action) {
        logSwallowed("cognitiveGraph.investigate.react.parseError", new Error(`ReAct 第 ${round} 轮响应格式无效`));
        break;
      }

      // ── LLM 给出最终结论 ──
      if (action.action === "result") {
        result = action.result;
        break;
      }

      // ── LLM 请求调用工具 ──
      const toolCalls = action.tool_calls.slice(0, 3); // 每轮最多 3 个工具
      const toolResults: ToolResultV2[] = [];

      // 并行执行（支持变量替换 + 缓存 + 审批门禁 + DB 日志）
      const toolExecPromises = toolCalls.map(async (tc) => {
        const v2Result = await executeToolCallV2(
          tc.name, tc.params ?? {}, toolExecCtx, allToolResultsV2,
        );
        return { call: tc, v2Result };
      });

      const execResults = await Promise.allSettled(toolExecPromises);
      for (const settled of execResults) {
        if (settled.status === "fulfilled") {
          const { call, v2Result } = settled.value;
          toolResults.push(v2Result);

          // 累积结果供链式引用
          allToolResultsV2.set(call.name, v2Result);

          // 记录到 evidence 和 toolsCalled
          if (v2Result.success) {
            allEvidence[call.name] = v2Result.data;
          } else {
            allEvidence[call.name] = { error: v2Result.error };
          }
          allToolsCalled.push({
            tool: call.name,
            input: call.params ?? {},
            outputSummary: v2Result.success ? "ok" : (v2Result.error ?? "failed"),
            durationMs: v2Result.latencyMs ?? 0,
          });
        } else {
          logSwallowed("cognitiveGraph.investigate.react.toolExec", settled.reason);
        }
      }

      // 构建本轮工具结果摘要 → 交给 ContextManager 管理滑动窗口
      const followUpPrompt = buildReactFollowUpPrompt({
        toolResults,
        roundNumber: round,
        maxRounds,
      });
      contextManager.addToolResultRound(followUpPrompt);
    }

    // P1-3 修复：ReAct 循环结束仍无结果 → 发一轮强制结论请求
    if (!result && allToolsCalled.length > 0) {
      // V2: 使用 ContextManager 构建含所有工具结果的完整 prompt + 强制结论指令
      contextManager.addToolResultRound("⚠️ 所有工具调用轮次已用完。请立即基于已收集的证据给出最终分析结论（action=result）。只输出 JSON，不要其他文字。");
      const forceContextResult = contextManager.build(CONTEXT_BUDGET_TOKENS);
      const forcePrompt = forceContextResult.prompt;

      const { data: forceData, tokensUsed } = await callDeepSeekJson<ReactAction>(
        forcePrompt, "cognitiveGraph.investigate.react.force",
      );
      totalTokens += tokensUsed;
      const forceAction = forceData ? parseReactResponse(forceData) : null;
      if (forceAction?.action === "result") {
        result = forceAction.result;
      }
    }

    // 如果 ReAct 循环未产出结果，降级用旧版 buildInvestigatePrompt
    if (!result) {
      logSwallowed("cognitiveGraph.investigate.react.fallback", new Error("ReAct 循环未产出结果，降级到直接分析"));
      const fallbackPrompt = buildInvestigatePrompt({
        thread,
        evidence: allEvidence,
        memories,
        portfolio: state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 },
      });
      const { data: fallbackResult, tokensUsed } = await callDeepSeekJson<InvestigateOutput>(
        fallbackPrompt, "cognitiveGraph.investigate.fallback",
      );
      totalTokens += tokensUsed;
      result = fallbackResult;
    }

    // 校验 investigate 输出
    if (result) {
      const valErrors = validateShape(result, { thesisChanged: "boolean", evidenceType: "string", evidenceSummary: "string" });
      if (valErrors.length > 0) {
        logSwallowed("cognitiveGraph.investigate.validation", new Error(valErrors.join("; ")));
      }
    }

    // 执行 thesis 更新
    if (result?.thesisChanged && result.updatedThesis) {
      await thesisStore.updateThesis(thread.id, {
        thesisText: result.updatedThesis,
        conviction: result.newConviction ?? undefined,
        invalidationConditions: result.invalidationConditions ?? undefined,
        reviewAt: result.suggestedReviewDays
          ? new Date(Date.now() + result.suggestedReviewDays * 86400000)
          : undefined,
      });
    }

    // 添加证据
    if (result?.evidenceSummary) {
      await thesisStore.addEvidence({
        threadId: thread.id,
        evidenceType: result.evidenceType ?? "neutral",
        source: "agent_reasoning",
        content: result.evidenceSummary,
        dataSnapshot: allEvidence,
      });
    }

    // P0-1: 创建观察记忆 — 无论 thesisChanged 与否，有效调查都留下记忆痕迹
    // thesisChanged 时由 reflectNode 创建记忆，这里只处理未变化的情况
    let observationMemCount = 0;
    if (result?.evidenceSummary && result.evidenceSummary.length > 20 && !result?.thesisChanged) {
      try {
        const content = `[观察] ${thread.title}: ${result.evidenceSummary.slice(0, 300)}`;
        const emb = await generateEmbedding(content);
        await memoryStore.createMemory({
          memoryType: "fact",
          content,
          relevanceTags: [thread.id, ...thread.tags],
          embedding: emb,
        });
        observationMemCount = 1;
      } catch (e) {
        logSwallowed("cognitiveGraph.investigate.observationMemory", e);
      }
    }

    // 合并子 agent 的 token 消耗
    const subAgentTokens = subAgentResultsForState.reduce((sum, r) => sum + r.tokensUsed, 0);

    return {
      investigateResult: result,
      retrievedMemories: memories,
      surprises: result?.surprises ?? [],
      thesesUpdated: (result?.thesisChanged ? 1 : 0) + subAgentResultsForState.filter(r => r.thesisChanged).length,
      memoriesCreated: observationMemCount,
      totalTokens: totalTokens + subAgentTokens,
      toolsCalled: allToolsCalled,
      subAgentResults: subAgentResultsForState,
      reasoningTraces: [{
        node: "investigate",
        threadId: thread.id,
        input: `${thread.title} | tools=${allToolsCalled.map(t => t.tool).join(",")} | subAgents=${subAgentResultsForState.length}`,
        output: result ? `changed=${result.thesisChanged} conviction=${result.newConviction} react_tools=${allToolsCalled.length}` : "no result",
        tokensUsed: totalTokens + subAgentTokens,
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.investigate", e);
    return { errors: [`investigate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
