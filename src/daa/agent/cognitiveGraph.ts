/**
 * Cognitive Agent OS — LangGraph 工作流
 *
 * Weekend 1 最小闭环：observe → prioritize → investigate → END
 * 后续 Weekend 添加：reflect / review / surface 节点
 */

import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { CognitiveStateAnnotation, type CognitiveState, type CognitiveUpdate, type PortfolioSnapshot, type MarketSnapshot, type NewsSnapshot } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, InvestigateOutput, Surprise, ReasoningTrace, ToolCallRecord, ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import { buildPrioritizePrompt, buildInvestigatePrompt } from "@/src/daa/agent/cognitivePrompts";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 工具导入（现有信号生成器） ──

import { buildTechnicalSignalForSymbol } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignalForSymbol } from "@/src/daa/signals/valuationSignal";

// ── 辅助：调用 DeepSeek ──

async function callDeepSeekJson<T>(prompt: string, scope: string): Promise<{ data: T | null; tokensUsed: number }> {
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
    logSwallowed(scope, e);
    return { data: null, tokensUsed: 0 };
  }
}

function estimateTokens(text: string): number {
  // 粗略估计：中文约 1.5 token/字，英文约 0.75 token/词
  return Math.ceil(text.length * 0.5);
}

// ── Observe 节点（代码驱动，不调 LLM）──

async function observeNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    // 获取活跃 thesis
    const activeTheses = await thesisStore.getActiveTheses();

    // 组合和市场数据暂时用占位符（需要连接现有 service）
    // Weekend 2 会对接 assetUniverseStore 和 marketIndicatorService
    const portfolio: PortfolioSnapshot = {
      holdings: [],
      totalEquity: 0,
      cashPct: 0,
    };

    const market: MarketSnapshot = {
      regime: "unknown",
      vix: null,
      indicators: {},
    };

    const news: NewsSnapshot = { items: [] };

    // 尝试加载真实数据（如果 service 可用）
    try {
      const { listDaaAssetUniverse } = await import("@/src/daa/store/assetUniverseStore");
      const rows = await listDaaAssetUniverse();
      const holdingRows = rows.filter((r: Record<string, unknown>) => Number(r.holding_qty ?? 0) > 0);
      const totalValue = holdingRows.reduce((sum: number, r: Record<string, unknown>) => {
        return sum + Number(r.holding_qty ?? 0) * Number(r.last_price ?? 0);
      }, 0);
      portfolio.holdings = holdingRows.map((r: Record<string, unknown>) => ({
        assetKey: String(r.asset_key ?? ""),
        symbol: String(r.symbol ?? ""),
        holdingQty: Number(r.holding_qty ?? 0),
        lastPrice: Number(r.last_price ?? 0),
        weightPct: totalValue > 0 ? (Number(r.holding_qty ?? 0) * Number(r.last_price ?? 0)) / totalValue : 0,
        unrealizedPnlPct: r.unrealized_pnl_pct != null ? Number(r.unrealized_pnl_pct) : null,
      }));
      portfolio.totalEquity = totalValue;
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.portfolio", e);
    }

    return {
      portfolio,
      market,
      news,
      activeTheses,
      toolsCalled: [{ tool: "observe", input: {}, outputSummary: `${activeTheses.length} theses, ${portfolio.holdings.length} holdings`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.observe", e);
    return { errors: [`observe: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Prioritize 节点（DeepSeek checkpoint）──

async function prioritizeNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    if (!state.portfolio) {
      return { errors: ["prioritize: no portfolio data"] };
    }

    const prompt = buildPrioritizePrompt({
      portfolio: state.portfolio,
      market: state.market ?? { regime: "unknown", vix: null, indicators: {} },
      news: state.news ?? { items: [] },
      theses: state.activeTheses,
    });

    const { data, tokensUsed } = await callDeepSeekJson<{
      targets: Array<{ threadId: string | null; reason: string; dataNeeded: string[] }>;
      newThreads: Array<{ title: string; initialThesis: string; assetKeys: string[]; tags: string[] }>;
    }>(prompt, "cognitiveGraph.prioritize");

    if (!data) {
      return {
        errors: ["prioritize: DeepSeek 未返回有效 JSON"],
        totalTokens: tokensUsed,
      };
    }

    // 创建新 thesis（如果 LLM 建议）
    for (const nt of data.newThreads ?? []) {
      try {
        const created = await thesisStore.createResearchThread({
          title: nt.title,
          thesisText: nt.initialThesis,
          assetKeys: nt.assetKeys,
          tags: nt.tags,
          conviction: "uncertain",
          reviewAt: new Date(Date.now() + 14 * 86400000), // 14 天后复盘
        });
        // 添加到调查队列
        data.targets.push({
          threadId: created.id,
          reason: "新创建的研究线索",
          dataNeeded: ["technical", "valuation"],
        });
      } catch (e) {
        logSwallowed("cognitiveGraph.prioritize.createThread", e);
      }
    }

    // 设置调查队列
    const targets: InvestigationTarget[] = (data.targets ?? []).slice(0, 3);
    const first = targets[0] ?? null;
    let currentThread: ResearchThread | null = null;
    if (first?.threadId) {
      currentThread = await thesisStore.getThesisById(first.threadId);
    }

    return {
      investigationQueue: targets,
      newThreadSuggestions: data.newThreads ?? [],
      currentTarget: first,
      currentThread,
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "prioritize",
        threadId: null,
        input: `${state.activeTheses.length} theses, ${state.portfolio.holdings.length} holdings`,
        output: `${targets.length} targets selected`,
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
      toolsCalled: [{ tool: "prioritize", input: {}, outputSummary: `${targets.length} targets`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.prioritize", e);
    return { errors: [`prioritize: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Investigate 节点（DeepSeek checkpoint）──

async function investigateNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  const target = state.currentTarget;
  const thread = state.currentThread;

  if (!target || !thread) {
    return {}; // 无目标，跳过
  }

  try {
    // 1. 收集证据（调用工具）
    const evidence: Record<string, unknown> = {};
    const newToolsCalled: ToolCallRecord[] = [];

    for (const toolName of target.dataNeeded) {
      const toolT0 = Date.now();
      try {
        if (toolName === "technical" && thread.assetKeys[0]) {
          const symbol = thread.assetKeys[0].split(":")[1] ?? thread.assetKeys[0];
          const signal = await buildTechnicalSignalForSymbol(symbol);
          evidence.technical = signal ? {
            scorePct: signal.scorePct,
            momentumRegime: signal.momentumRegime,
            metrics: signal.metrics,
            reasons: signal.reasons,
          } : null;
        } else if (toolName === "valuation" && thread.assetKeys[0]) {
          const symbol = thread.assetKeys[0].split(":")[1] ?? thread.assetKeys[0];
          const signal = await buildValuationSignalForSymbol(symbol);
          evidence.valuation = signal ? {
            scorePct: signal.scorePct,
            temperature: signal.temperature,
            metrics: signal.metrics,
            reasons: signal.reasons,
          } : null;
        }
        // news 和其他工具留给 Weekend 2
      } catch (e) {
        logSwallowed(`cognitiveGraph.investigate.tool.${toolName}`, e);
        evidence[toolName] = { error: String(e) };
      }
      newToolsCalled.push({
        tool: toolName,
        input: { assetKeys: thread.assetKeys },
        outputSummary: evidence[toolName] ? "ok" : "failed",
        durationMs: Date.now() - toolT0,
      });
    }

    // 2. 检索相关记忆
    const queryEmb = await generateEmbedding(thread.title + " " + thread.thesisText);
    const memories = await memoryStore.recallMemory({ queryEmbedding: queryEmb, limit: 5 });

    // 3. DeepSeek 推理
    const prompt = buildInvestigatePrompt({
      thread,
      evidence,
      memories,
      portfolio: state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 },
    });

    const { data: result, tokensUsed } = await callDeepSeekJson<InvestigateOutput>(
      prompt, "cognitiveGraph.investigate",
    );

    // 4. 执行 thesis 更新
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

    // 5. 添加证据
    if (result?.evidenceSummary) {
      await thesisStore.addEvidence({
        threadId: thread.id,
        evidenceType: result.evidenceType ?? "neutral",
        source: "agent_reasoning",
        content: result.evidenceSummary,
        dataSnapshot: evidence,
      });
    }

    return {
      investigateResult: result,
      retrievedMemories: memories,
      surprises: result?.surprises ?? [],
      thesesUpdated: result?.thesisChanged ? 1 : 0,
      totalTokens: tokensUsed,
      toolsCalled: newToolsCalled,
      reasoningTraces: [{
        node: "investigate",
        threadId: thread.id,
        input: `${thread.title} | ${Object.keys(evidence).join(",")}`,
        output: result ? `changed=${result.thesisChanged} conviction=${result.newConviction}` : "no result",
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.investigate", e);
    return { errors: [`investigate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Graph 组装 ──

function buildCognitiveGraph() {
  const graph = new StateGraph(CognitiveStateAnnotation)
    .addNode("observe", observeNode)
    .addNode("prioritize", prioritizeNode)
    .addNode("investigate", investigateNode)
    .addEdge(START, "observe")
    .addEdge("observe", "prioritize")
    .addConditionalEdges("prioritize", (state: CognitiveState) => {
      if (state.currentTarget && state.currentThread) return "investigate";
      return END; // 无调查目标 → 结束
    })
    .addEdge("investigate", END); // Weekend 1：调查完直接结束

  // Weekend 2 将添加：investigate → reflect → next_target → investigate 循环

  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

// 单例
let _compiledGraph: ReturnType<typeof buildCognitiveGraph> | null = null;

export function getCognitiveGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildCognitiveGraph();
  }
  return _compiledGraph;
}

/**
 * 运行一次完整的认知 Agent 循环。
 */
export async function runCognitiveAgentCycle(trigger: "scheduled" | "manual" | "event_driven" = "manual"): Promise<{
  runId: string;
  thesesUpdated: number;
  surprises: Surprise[];
  totalTokens: number;
  errors: string[];
  durationMs: number;
}> {
  const { createAgentRun, completeAgentRun } = await import("@/src/daa/agent/store/agentRunStore");

  const t0 = Date.now();
  const run = await createAgentRun({ trigger });
  const threadId = `cognitive-run-${run.id}`;

  try {
    const graph = getCognitiveGraph();
    const result = await graph.invoke(
      {}, // 初始状态为空，observe 节点会填充
      { configurable: { thread_id: threadId } },
    );

    const durationMs = Date.now() - t0;
    await completeAgentRun(run.id, {
      status: (result.errors?.length ?? 0) > 0 ? "completed" : "completed",
      targetThreadIds: result.investigationQueue?.map((t: InvestigationTarget) => t.threadId).filter(Boolean) as string[] ?? [],
      toolsCalled: result.toolsCalled ?? [],
      reasoningTraces: result.reasoningTraces ?? [],
      surprises: result.surprises ?? [],
      totalTokens: result.totalTokens ?? 0,
      durationMs,
    });

    return {
      runId: run.id,
      thesesUpdated: result.thesesUpdated ?? 0,
      surprises: result.surprises ?? [],
      totalTokens: result.totalTokens ?? 0,
      errors: result.errors ?? [],
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - t0;
    await completeAgentRun(run.id, {
      status: "failed",
      durationMs,
    }).catch(err => logSwallowed("cognitiveGraph.run.completeOnError", err));

    return {
      runId: run.id,
      thesesUpdated: 0,
      surprises: [],
      totalTokens: 0,
      errors: [e instanceof Error ? e.message : String(e)],
      durationMs,
    };
  }
}
