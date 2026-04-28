/**
 * Cognitive Agent — Investigate 节点（Phase 3: ReAct 循环 — LLM 自主选择工具）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import type { InvestigateOutput, ToolCallRecord } from "@/src/daa/agent/cognitiveTypes";
import { buildReactInvestigatePromptSections, buildReactFollowUpPrompt } from "@/src/daa/agent/cognitivePrompts";
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
    let subAgentMemCount = 0;
    let subAgentFanoutCompleted = false;
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
        // 持久化子 agent 的调查产出 — 和父 agent 对称：
        // updateThesis → addEvidence → touchThesis（无论是否变更）→ createMemory（未变更时）
        // 这样 sub-agent 调查过的 thesis 下一个 cycle 不会再被误判为"N 天未复盘"。
        for (const s of settled) {
          if (s.status !== "fulfilled" || !s.value) continue;
          const r = s.value;
          const out = r.investigateOutput;
          const subThread = await thesisStore.getThesisById(r.threadId).catch(() => null);
          subAgentResultsForState.push({
            threadId: r.threadId,
            threadTitle: r.threadTitle,
            summary: out?.evidenceSummary ?? "无结论",
            thesisChanged: out?.thesisChanged ?? false,
            toolsUsed: r.toolsCalled.map(tc => tc.tool),
            tokensUsed: r.tokensUsed,
          });

          if (!out || !subThread) continue;

          // 1) thesis 文本 / conviction / 失效条件 / 复盘时间 更新（与父 agent 同一套字段）
          if (out.thesisChanged && out.updatedThesis) {
            try {
              await thesisStore.updateThesis(r.threadId, {
                thesisText: out.updatedThesis,
                conviction: out.newConviction ?? undefined,
                invalidationConditions: out.invalidationConditions ?? undefined,
                reviewAt: out.suggestedReviewDays
                  ? new Date(Date.now() + out.suggestedReviewDays * 86400000)
                  : undefined,
              });
            } catch (e) {
              logSwallowed("cognitiveGraph.investigate.subAgent.updateThesis", e);
            }
          }

          // 2) 证据链：无论是否变更，有摘要就存档
          if (out.evidenceSummary) {
            try {
              await thesisStore.addEvidence({
                threadId: r.threadId,
                evidenceType: out.evidenceType ?? "neutral",
                source: "agent_reasoning",
                content: `[子 agent] ${out.evidenceSummary}`,
              });
            } catch (e) {
              logSwallowed("cognitiveGraph.investigate.subAgent.evidence", e);
            }
          }

          // 3) bump updated_at — 核心修复：否则 cognitionGap 永远显示"N 天未复盘"
          if (out.evidenceSummary || out.thesisChanged === false) {
            try {
              await thesisStore.touchThesis(r.threadId);
            } catch (e) {
              logSwallowed("cognitiveGraph.investigate.subAgent.touch", e);
            }
          }

          // 4) 未变更时创建观察记忆（变更时由 reflect 节点创建反思记忆，这里避免重复）
          if (out.evidenceSummary && out.evidenceSummary.length > 20 && !out.thesisChanged) {
            try {
              const content = `[子 agent 观察] ${subThread.title}: ${out.evidenceSummary.slice(0, 300)}`;
              const emb = await generateEmbedding(content);
              await memoryStore.createMemory({
                memoryType: "fact",
                content,
                relevanceTags: [r.threadId, ...subThread.tags],
                embedding: emb,
                thread: { id: r.threadId, assetKeys: subThread.assetKeys, tags: subThread.tags },
              });
              subAgentMemCount++;
            } catch (e) {
              logSwallowed("cognitiveGraph.investigate.subAgent.memory", e);
            }
          }
        }
        subAgentFanoutCompleted = true;
      } catch (e) {
        logSwallowed("cognitiveGraph.investigate.subAgents", e);
      }
    }

    const maxRounds = state.agentConfig?.maxReactRounds ?? 5;
    const allToolsCalled: ToolCallRecord[] = [];
    const allEvidence: Record<string, unknown> = {};
    let totalTokens = 0;

    // 检索相关记忆（在 ReAct 循环开始前）— 三路召回：向量 + 关键字 + 实体图
    const queryEmb = await generateEmbedding(thread.title + " " + thread.thesisText);
    // 从 assetKeys 抽 ticker 作为关键字（精确匹配优先）
    const tickerKeywords = thread.assetKeys
      .map(k => k.split("::")[1]?.split(".")[0])
      .filter((v): v is string => !!v);
    const recallLimit = state.agentConfig?.memoryRecallLimit ?? 5;

    // 实体图召回：优先拉取关联到当前 thesis 的 asset 实体上的历史记忆
    const entityMemPromise = (async () => {
      try {
        const { getMemoriesByEntity } = await import("@/src/daa/agent/entities/entityStore");
        const results = await Promise.all(
          thread.assetKeys.slice(0, 3).map(key =>
            getMemoriesByEntity("asset", key, 3),
          ),
        );
        return results.flat();
      } catch (e) {
        logSwallowed("cognitiveGraph.investigate.entityRecall", e);
        return [];
      }
    })();

    const [baseMemories, entityMems] = await Promise.all([
      memoryStore.recallMemoryHybrid({
        queryEmbedding: queryEmb,
        keywords: tickerKeywords,
        tags: [thread.id, ...thread.tags],
        vectorLimit: recallLimit,
        totalLimit: recallLimit,
      }),
      entityMemPromise,
    ]);

    // 合并去重（base 优先）
    const memMap = new Map(baseMemories.map(m => [m.id, m]));
    for (const m of entityMems) {
      if (memMap.size >= recallLimit + 2) break; // 实体召回最多补 2 条
      if (!memMap.has(m.id)) memMap.set(m.id, m);
    }
    const memories = Array.from(memMap.values()).slice(0, recallLimit + 2);

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
      // V2: ContextManager + LLM 语义摘要（超预算时用 fast tier LLM 压缩而非截断）
      const contextResult = await contextManager.buildAsync(CONTEXT_BUDGET_TOKENS);
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
      const forceContextResult = await contextManager.buildAsync(CONTEXT_BUDGET_TOKENS);
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

    // 校验 investigate 输出
    if (result) {
      const valErrors = validateShape(result, { thesisChanged: "boolean", evidenceType: "string", evidenceSummary: "string" });
      if (valErrors.length > 0) {
        logSwallowed("cognitiveGraph.investigate.validation", new Error(valErrors.join("; ")));
      }
      // 规范 surprises 结构：LLM 偶尔会把 surprises 写成字符串数组或字段缺失的对象。
      // 缺失的 title/description/severityScore 会导致 surfaceNode 直接把占位符传给 UI，
      // 渲染成没有标题的空 SeverityBadge。直接在源头丢弃不合法的条目。
      const rawSurprises: unknown[] = Array.isArray(result.surprises) ? result.surprises : [];
      result.surprises = rawSurprises
        .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
        .map((s) => {
          const title = typeof s.title === "string" ? s.title.trim() : "";
          const description = typeof s.description === "string" ? s.description.trim() : "";
          const severity = Number(s.severityScore);
          return {
            title,
            description,
            relatedThesisId: typeof s.relatedThesisId === "string" ? s.relatedThesisId : null,
            severityScore: Number.isFinite(severity) ? Math.max(1, Math.min(10, Math.round(severity))) : 0,
            suggestedAction: typeof s.suggestedAction === "string" ? s.suggestedAction : "",
          };
        })
        .filter((s) => s.title.length > 0 && s.severityScore >= 3);
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

    // 调查完成无论 thesis 是否变化都 bump updated_at，防止认知缺口天数
    // 永久增长的 bug：否则 LLM 说"无变化"时 target thesis 虽然被调查过但
    // updated_at 纹丝不动，日报里 medium thesis 永远是 "N 天未调查"。
    if (result?.evidenceSummary || result?.thesisChanged === false) {
      try {
        await thesisStore.touchThesis(thread.id);
      } catch (e) {
        logSwallowed("cognitiveGraph.investigate.touch", e);
      }
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
          thread: { id: thread.id, assetKeys: thread.assetKeys, tags: thread.tags },
        });
        observationMemCount = 1;
      } catch (e) {
        logSwallowed("cognitiveGraph.investigate.observationMemory", e);
      }
    }

    // 合并子 agent 的 token 消耗
    const subAgentTokens = subAgentResultsForState.reduce((sum, r) => sum + r.tokensUsed, 0);

    return {
      // 剩余队列已经由子 agent 并行消费，清掉它们，避免 LangGraph 后续循环重复调查。
      investigationQueue: subAgentFanoutCompleted ? [target] : state.investigationQueue,
      investigateResult: result,
      retrievedMemories: memories,
      surprises: result?.surprises ?? [],
      thesesUpdated: (result?.thesisChanged ? 1 : 0) + subAgentResultsForState.filter(r => r.thesisChanged).length,
      memoriesCreated: observationMemCount + subAgentMemCount,
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
