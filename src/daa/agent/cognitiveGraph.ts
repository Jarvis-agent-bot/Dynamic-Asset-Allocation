/**
 * Cognitive Agent OS — LangGraph 工作流
 *
 * 完整循环：observe → prioritize → investigate → reflect → (next_target → investigate)* → review → END
 */

import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { CognitiveStateAnnotation, type CognitiveState, type CognitiveUpdate, type PortfolioSnapshot, type MarketSnapshot, type NewsSnapshot } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, InvestigateOutput, Surprise, ReasoningTrace, ToolCallRecord, ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import { buildPrioritizePrompt, buildInvestigatePrompt } from "@/src/daa/agent/cognitivePrompts";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 工具导入（现有信号生成器 + 数据服务） ──

import { buildTechnicalSignalForSymbol } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignalForSymbol } from "@/src/daa/signals/valuationSignal";
import { buildNewsSignalForSymbol } from "@/src/daa/signals/newsSignal";
import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { listLatestDaaMarketIndicatorSnapshots, listDaaNewsItemsBySymbol } from "@/src/daa/store/marketCacheStore";

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
    const activeTheses = await thesisStore.getActiveTheses();

    // 1. 组合数据
    const portfolio: PortfolioSnapshot = { holdings: [], totalEquity: 0, cashPct: 0 };
    try {
      const rows = await listDaaAssetUniverse();
      const holdingRows = rows.filter(r => r.holdingQty > 0);
      const totalValue = holdingRows.reduce((sum, r) => sum + r.holdingQty * r.lastPrice, 0);
      portfolio.holdings = holdingRows.map(r => ({
        assetKey: r.assetKey,
        symbol: r.symbol,
        holdingQty: r.holdingQty,
        lastPrice: r.lastPrice,
        weightPct: totalValue > 0 ? (r.holdingQty * r.lastPrice) / totalValue : 0,
        unrealizedPnlPct: r.costBasisInBase != null && r.costBasisInBase > 0
          ? (r.lastPrice * r.holdingQty - r.costBasisInBase) / r.costBasisInBase
          : null,
      }));
      portfolio.totalEquity = totalValue;
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.portfolio", e);
    }

    // 2. 市场指标（从 DB 缓存读取）
    const market: MarketSnapshot = { regime: "unknown", vix: null, indicators: {} };
    try {
      const snapshots = await listLatestDaaMarketIndicatorSnapshots();
      const vixSnap = snapshots.find(s => s.key === "vix");
      market.vix = vixSnap?.rawValue ?? null;
      // 推导 regime：找到 riskOffScorePct 最高的 scope
      const riskOffScores = snapshots.map(s => s.riskOffScorePct).filter(v => v > 0);
      const avgRiskOff = riskOffScores.length > 0 ? riskOffScores.reduce((a, b) => a + b, 0) / riskOffScores.length : 50;
      market.regime = avgRiskOff > 65 ? "risk_off" : avgRiskOff < 40 ? "risk_on" : "transitional";
      market.indicators = Object.fromEntries(
        snapshots.slice(0, 10).map(s => [s.key, {
          value: s.rawValue,
          percentile: s.percentile252 ?? 50,
          stance: s.stance,
        }]),
      );
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.market", e);
    }

    // 3. 最近新闻（从 DB 缓存读取，不调外部 API）
    const news: NewsSnapshot = { items: [] };
    try {
      // 获取持仓资产的最近新闻
      const holdingSymbols = portfolio.holdings.slice(0, 10).map(h => h.symbol);
      for (const sym of holdingSymbols.slice(0, 5)) {
        const items = await listDaaNewsItemsBySymbol({ symbol: sym, limit: 3 });
        for (const item of items) {
          news.items.push({
            symbol: sym,
            title: item.title ?? "",
            ts: item.publishedAt ?? item.fetchedAt ?? "",
          });
        }
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.news", e);
    }

    return {
      portfolio,
      market,
      news,
      activeTheses,
      toolsCalled: [{ tool: "observe", input: {}, outputSummary: `${activeTheses.length} theses, ${portfolio.holdings.length} holdings, ${news.items.length} news, regime=${market.regime}`, durationMs: Date.now() - t0 }],
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
        } else if (toolName === "news" && thread.assetKeys[0]) {
          const symbol = thread.assetKeys[0].split(":")[1] ?? thread.assetKeys[0];
          const market = thread.assetKeys[0].split(":")[0] ?? "US";
          const signal = await buildNewsSignalForSymbol(symbol, market);
          evidence.news = signal ? {
            scorePct: signal.scorePct,
            evidenceCount: signal.evidenceCount,
            llmSummary: signal.llmSummary,
            llmDrivers: signal.llmDrivers,
            llmMajorEvent: signal.llmMajorEvent,
            reasons: signal.reasons,
            items: signal.items?.slice(0, 5).map(i => ({ title: i.title, ts: i.ts })),
          } : null;
        }
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

// ── Reflect 节点（DeepSeek checkpoint — 只在 conviction 变化时有意义）──

async function reflectNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  const result = state.investigateResult;
  const thread = state.currentThread;

  // 如果 conviction 没变，跳过反思
  if (!result?.thesisChanged || !thread) {
    return {};
  }

  try {
    const prompt = `你是一个投资研究操作系统的「首席风控官」。刚刚一个研究论点发生了判断变化，你需要反思。

## 论点变化
标题: ${sanitizeForPrompt(thread.title, 80)}
旧判断: ${sanitizeForPrompt(thread.thesisText, 200)}
新判断: ${sanitizeForPrompt(result.updatedThesis ?? "", 200)}
旧信念: ${thread.conviction} → 新信念: ${result.newConviction ?? thread.conviction}

## 证据摘要
${sanitizeForPrompt(result.evidenceSummary, 300)}

## 任务
1. 这个变化是否合理？有没有过度反应的风险？
2. 之前有没有类似的判断变化模式？
3. 是否有值得长期记住的教训？

## 输出格式（严格 JSON）
\`\`\`json
{
  "reflectionSummary": "反思总结",
  "overreactionRisk": "low/medium/high",
  "newMemory": {
    "type": "lesson",
    "content": "值得记住的教训（如果有的话，没有则设为 null）"
  }
}
\`\`\`

只输出 JSON，不要其他文字。`;

    const { data, tokensUsed } = await callDeepSeekJson<{
      reflectionSummary: string;
      overreactionRisk: string;
      newMemory: { type: string; content: string } | null;
    }>(prompt, "cognitiveGraph.reflect");

    let newMemCount = 0;
    if (data?.newMemory?.content) {
      const emb = await generateEmbedding(data.newMemory.content);
      await memoryStore.createMemory({
        memoryType: (data.newMemory.type as "lesson" | "pattern" | "preference" | "fact") || "lesson",
        content: data.newMemory.content,
        relevanceTags: thread.tags,
        embedding: emb,
      });
      newMemCount = 1;
    }

    return {
      memoriesCreated: newMemCount,
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "reflect",
        threadId: thread.id,
        input: `conviction change: ${thread.conviction} → ${result.newConviction}`,
        output: data ? `risk=${data.overreactionRisk}, memory=${newMemCount > 0 ? "created" : "none"}` : "no result",
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.reflect", e);
    return { errors: [`reflect: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Next Target 辅助节点 ──

async function loadNextTarget(state: CognitiveState): Promise<CognitiveUpdate> {
  const queue = Array.isArray(state.investigationQueue) ? state.investigationQueue : [];
  const remaining = queue.slice(1);
  const next = remaining[0] ?? null;

  let currentThread: ResearchThread | null = null;
  if (next?.threadId) {
    currentThread = await thesisStore.getThesisById(next.threadId);
  }

  return {
    investigationQueue: remaining,
    currentTarget: next,
    currentThread,
    investigateResult: null,
  };
}

// ── Review 节点（检查到期待复盘的 thesis）──

async function reviewNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    const dueTheses = await thesisStore.getDueReviews();
    if (dueTheses.length === 0) return {};

    let totalTokens = 0;
    const traces: ReasoningTrace[] = [];

    for (const thread of dueTheses.slice(0, 3)) {
      try {
        const prompt = `你是一个投资研究操作系统的「复盘审计师」。以下论点已到复盘日期。

## 论点信息
标题: ${sanitizeForPrompt(thread.title, 80)}
当时判断: ${sanitizeForPrompt(thread.thesisText, 200)}
信念强度: ${thread.conviction}
创建时间: ${thread.createdAt}

## 当前市场
Regime: ${state.market?.regime ?? "unknown"}
VIX: ${state.market?.vix ?? "N/A"}

## 任务
评估这个论点到目前为止是否准确。

## 输出格式（严格 JSON）
\`\`\`json
{
  "actualOutcome": "实际发生了什么",
  "accuracyScore": 0.7,
  "lesson": "从这次复盘中学到的教训（如果有）",
  "shouldArchive": false
}
\`\`\`

只输出 JSON，不要其他文字。`;

        const { data, tokensUsed } = await callDeepSeekJson<{
          actualOutcome: string;
          accuracyScore: number;
          lesson: string | null;
          shouldArchive: boolean;
        }>(prompt, "cognitiveGraph.review");

        totalTokens += tokensUsed;

        if (data) {
          // 保存复盘记录
          const { randomUUID } = await import("node:crypto");
          const { withDaaPgClient } = await import("@/src/daa/pg/daaPg");
          await withDaaPgClient(async ({ query }) => {
            await query(
              `INSERT INTO daa_thesis_reviews (id, thread_id, review_window, thesis_at_time, conviction_at_time, actual_outcome, accuracy_score, lessons_learned)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [randomUUID(), thread.id, "30d", thread.thesisText, thread.conviction, data.actualOutcome, data.accuracyScore, data.lesson],
            );
          });

          // 生成教训记忆
          if (data.lesson) {
            const emb = await generateEmbedding(data.lesson);
            await memoryStore.createMemory({
              memoryType: "lesson",
              content: data.lesson,
              relevanceTags: thread.tags,
              embedding: emb,
            });
          }

          // 更新 thesis：设定下次复盘或归档
          if (data.shouldArchive) {
            await thesisStore.updateThesis(thread.id, { status: "archived" });
          } else {
            await thesisStore.updateThesis(thread.id, {
              reviewAt: new Date(Date.now() + 30 * 86400000),
            });
          }
        }

        traces.push({
          node: "review",
          threadId: thread.id,
          input: thread.title,
          output: data ? `accuracy=${data.accuracyScore}, archive=${data.shouldArchive}` : "no result",
          tokensUsed,
          durationMs: Date.now() - t0,
        });
      } catch (e) {
        logSwallowed(`cognitiveGraph.review.${thread.id}`, e);
      }
    }

    return { totalTokens, reasoningTraces: traces };
  } catch (e) {
    logSwallowed("cognitiveGraph.review", e);
    return { errors: [`review: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Graph 组装 ──

function buildCognitiveGraph() {
  const graph = new StateGraph(CognitiveStateAnnotation)
    .addNode("observe", observeNode)
    .addNode("prioritize", prioritizeNode)
    .addNode("investigate", investigateNode)
    .addNode("reflect", reflectNode)
    .addNode("next_target", loadNextTarget)
    .addNode("review", reviewNode)
    .addEdge(START, "observe")
    .addEdge("observe", "prioritize")
    .addConditionalEdges("prioritize", (state: CognitiveState) => {
      if (state.currentTarget && state.currentThread) return "investigate";
      return "review"; // 无调查目标 → 跳到复盘
    })
    .addConditionalEdges("investigate", (state: CognitiveState) => {
      if (state.investigateResult?.thesisChanged) return "reflect";
      // conviction 没变 → 直接到下一个目标
      if (state.investigationQueue.length > 1) return "next_target";
      return "review";
    })
    .addConditionalEdges("reflect", (state: CognitiveState) => {
      if (state.investigationQueue.length > 1) return "next_target";
      return "review";
    })
    .addConditionalEdges("next_target", (state: CognitiveState) => {
      if (state.currentTarget) return "investigate";
      return "review";
    })
    .addEdge("review", END);

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
