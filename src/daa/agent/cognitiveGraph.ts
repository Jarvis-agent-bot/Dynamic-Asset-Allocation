/**
 * Cognitive Agent OS — LangGraph 工作流
 *
 * 完整循环：observe → prioritize → investigate → reflect → (next_target → investigate)* → review → END
 */

import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { CognitiveStateAnnotation, type CognitiveState, type CognitiveUpdate, type PortfolioSnapshot, type MarketSnapshot, type NewsSnapshot } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, InvestigateOutput, Surprise, ReasoningTrace, ToolCallRecord, ResearchThread, DailyBriefing, CognitionGap, MindChangeCondition, AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import { buildPrioritizePrompt, buildInvestigatePrompt, buildReactInvestigatePromptSections, buildReactFollowUpPrompt, buildReflectPrompt, buildReviewPrompt, buildSurfacePrompt, buildStrategyAdvisorPrompt, formatBriefingForTelegram } from "@/src/daa/agent/cognitivePrompts";
import { createInvestigateContextManager } from "@/src/daa/agent/context/contextEngine";

// ── Tool System V2（Hermes 模式：import 触发自注册）──
import "@/src/daa/agent/tools/index";
import {
  getToolDefinitions,
  executeToolCallV2,
  formatToolDefinitionsV2ForPrompt,
  clearToolResultCache,
  setCurrentRunId,
} from "@/src/daa/agent/tools/registry";
import type { ToolResultV2, ToolExecutionContext } from "@/src/daa/agent/tools/types";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";

import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 数据服务导入 ──

import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { listLatestDaaMarketIndicatorSnapshots, listDaaNewsItemsBySymbol } from "@/src/daa/store/marketCacheStore";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { findSimilarThesis } from "@/src/daa/agent/store/thesisStore";
import { getDaaSystemConfig } from "@/src/daa/store/accountStore";
import type { ThesisFailureImpact, ThesisConflict } from "@/src/daa/agent/cognitiveTypes";

// ── 常量 ──

/** DeepSeek 平均成本：input $0.14/M + output $0.28/M，取均值 $0.21/M */
export const DEEPSEEK_AVG_COST_PER_TOKEN = 0.00000021;

// ── 辅助：调用 DeepSeek（含重试 + 熔断）──

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
async function callDeepSeekJson<T>(prompt: string, scope: string, maxRetries = 2): Promise<{ data: T | null; tokensUsed: number }> {
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
      // JSON 解析失败或最后一次尝试 → 不再重试
      break;
    }
  }
  logSwallowed(scope, lastError);
  return { data: null, tokensUsed: 0 };
}

export function estimateTokens(text: string): number {
  // 粗略估计：中文约 1.5 token/字，英文约 0.75 token/词
  return Math.ceil(text.length * 0.5);
}

// ── 辅助：LLM 输出结构校验 ──

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
function shouldCircuitBreak(errors: string[], threshold = 3): boolean {
  const llmFailures = errors.filter(e => e.includes("DeepSeek") || e.includes("LLM") || e.includes("noJson")).length;
  return llmFailures >= threshold;
}

// ── Observe 节点（代码驱动，不调 LLM）──

async function observeNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    // Feature A: 从 DB 加载 Agent 配置
    let agentConfig: CognitiveState["agentConfig"] = null;
    try {
      const sysConfig = await getDaaSystemConfig();
      const ca = sysConfig.config.cognitiveAgent;
      if (ca) {
        agentConfig = {
          enabled: ca.enabled,
          maxInvestigationTargets: ca.maxInvestigationTargets,
          reviewIntervalDays: ca.reviewIntervalDays,
          memoryRecallLimit: ca.memoryRecallLimit,
          circuitBreakerThreshold: ca.circuitBreakerThreshold,
          schedule: ca.schedule,
          scheduleTimesUtc: ca.scheduleTimesUtc,
          memoryDecayRate: ca.memoryDecayRate,
          memoryArchiveThreshold: ca.memoryArchiveThreshold,
          agentOverlayEnabled: ca.agentOverlayEnabled ?? false,
          agentTriggerEnabled: ca.agentTriggerEnabled ?? false,
          defaultDriftThresholdPct: sysConfig.config.rebalanceStrategy?.drift?.thresholdPct ?? 0.05,
          maxPositionPct: sysConfig.config.strategy?.constraints?.maxPositionPct ?? 0.30,
        };
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.config", e);
    }

    // Feature E: 记忆衰减 — 在 cycle 开始时批量执行
    try {
      const decayRate = agentConfig?.memoryDecayRate ?? 0.97;
      await memoryStore.applyMemoryDecay(decayRate);
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.memoryDecay", e);
    }

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
      agentConfig,
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

    // 2B: 预加载 thesis 准确率，供 LLM 做优先级判断
    const thesisAccuracy = new Map<string, number>();
    for (const t of state.activeTheses.slice(0, 15)) {
      try {
        const avg = await thesisStore.getThesisAccuracyAvg(t.id);
        if (avg !== null) thesisAccuracy.set(t.id, avg);
      } catch (e) {
        logSwallowed("cognitiveGraph.prioritize.accuracy", e);
      }
    }

    const prompt = buildPrioritizePrompt({
      portfolio: state.portfolio,
      market: state.market ?? { regime: "unknown", vix: null, indicators: {} },
      news: state.news ?? { items: [] },
      theses: state.activeTheses,
      thesisAccuracy,
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

    // P0-2: 校验 LLM 输出结构
    const valErrors = validateShape(data, { targets: "array" });
    if (valErrors.length > 0) {
      return {
        errors: valErrors.map(e => `prioritize.validation: ${e}`),
        totalTokens: tokensUsed,
      };
    }

    // 创建新 thesis（如果 LLM 建议），P2-9: 去重检查
    for (const nt of data.newThreads ?? []) {
      try {
        // 检查是否存在相似 thesis
        const existing = await findSimilarThesis(nt.assetKeys ?? [], nt.title);
        if (existing) {
          logSwallowed("cognitiveGraph.prioritize.dedup", new Error(`跳过重复 thesis: "${nt.title}" 已有类似 "${existing.title}"`));
          continue;
        }
        const created = await thesisStore.createResearchThread({
          title: nt.title,
          thesisText: nt.initialThesis,
          assetKeys: nt.assetKeys,
          tags: nt.tags,
          conviction: "uncertain",
          reviewAt: new Date(Date.now() + (state.agentConfig?.reviewIntervalDays ?? 14) * 86400000),
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
    const maxTargets = state.agentConfig?.maxInvestigationTargets ?? 3;
    const targets: InvestigationTarget[] = (data.targets ?? []).slice(0, maxTargets);
    const first = targets[0] ?? null;
    let currentThread: ResearchThread | null = null;
    if (first?.threadId) {
      currentThread = await thesisStore.getThesisById(first.threadId);
    }

    // Phase 2: 加载匹配的调查策略（基于当前 regime + conviction + tags）
    let matchedStrategies: CognitiveUpdate["matchedStrategies"] = [];
    try {
      const { findMatchingStrategies } = await import("@/src/daa/agent/learning/strategyStore");
      const strategies = await findMatchingStrategies({
        regime: state.market?.regime ?? "unknown",
        conviction: first?.threadId ? (currentThread?.conviction ?? "uncertain") : "uncertain",
        tags: currentThread?.tags ?? [],
        assetKeys: currentThread?.assetKeys ?? [],
      });
      matchedStrategies = strategies.map(s => ({
        id: s.id,
        name: s.name,
        triggerConditions: s.triggerConditions,
        toolSequence: s.toolSequence,
        promptTemplate: s.promptTemplate,
        successRate: s.successRate,
      }));
    } catch (e) {
      logSwallowed("cognitiveGraph.prioritize.matchStrategies", e);
    }

    return {
      investigationQueue: targets,
      newThreadSuggestions: data.newThreads ?? [],
      currentTarget: first,
      currentThread,
      matchedStrategies,
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "prioritize",
        threadId: null,
        input: `${state.activeTheses.length} theses, ${state.portfolio.holdings.length} holdings`,
        output: `${targets.length} targets, ${matchedStrategies.length} strategies matched`,
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
      toolsCalled: [{ tool: "prioritize", input: {}, outputSummary: `${targets.length} targets, ${matchedStrategies.length} strategies`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.prioritize", e);
    return { errors: [`prioritize: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Investigate 节点（Phase 3: ReAct 循环 — LLM 自主选择工具）──

/** ReAct 循环解析：从 LLM 输出中提取 action 类型 */
type ReactAction =
  | { action: "tool_calls"; tool_calls: Array<{ name: string; params: Record<string, unknown> }>; reasoning?: string }
  | { action: "result"; result: InvestigateOutput };

function parseReactResponse(data: unknown): ReactAction | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.action === "tool_calls" && Array.isArray(obj.tool_calls)) {
    // 校验每个 tool_call 至少有 name 字段
    const validCalls = (obj.tool_calls as Array<Record<string, unknown>>)
      .filter(tc => tc && typeof tc === "object" && typeof tc.name === "string" && tc.name.length > 0)
      .map(tc => ({ name: String(tc.name), params: (tc.params && typeof tc.params === "object" ? tc.params : {}) as Record<string, unknown> }));
    if (validCalls.length === 0) return null; // 所有 tool_call 无效
    return { action: "tool_calls", tool_calls: validCalls, reasoning: typeof obj.reasoning === "string" ? obj.reasoning : undefined };
  }
  if (obj.action === "result" && obj.result && typeof obj.result === "object") {
    return { action: "result", result: obj.result as InvestigateOutput };
  }
  // 兼容：如果 LLM 直接返回 InvestigateOutput（无 action 包装）
  if ("thesisChanged" in obj && "evidenceSummary" in obj) {
    return { action: "result", result: obj as unknown as InvestigateOutput };
  }
  return null;
}

async function investigateNode(state: CognitiveState): Promise<CognitiveUpdate> {
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

// ── Reflect 节点（DeepSeek checkpoint — 只在 conviction 变化时有意义）──

async function reflectNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  const result = state.investigateResult;
  const thread = state.currentThread;

  // 如果 conviction 没变，跳过反思
  if (!result?.thesisChanged || !thread) {
    return {};
  }

  if (shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
    return { errors: ["reflect: 熔断 — 跳过"] };
  }

  try {
    const prompt = buildReflectPrompt({
      thread,
      updatedThesis: result.updatedThesis ?? "",
      newConviction: result.newConviction ?? thread.conviction,
      evidenceSummary: result.evidenceSummary,
    });

    const { data, tokensUsed } = await callDeepSeekJson<{
      reflectionSummary: string;
      overreactionRisk: string;
      newMemory: { type: string; content: string } | null;
    }>(prompt, "cognitiveGraph.reflect");

    // P0-2: 校验 reflect 输出
    if (data) {
      const valErrors = validateShape(data, { reflectionSummary: "string", overreactionRisk: "string" });
      if (valErrors.length > 0) {
        logSwallowed("cognitiveGraph.reflect.validation", new Error(valErrors.join("; ")));
      }
    }

    let newMemCount = 0;
    if (data?.newMemory?.content) {
      try {
        const emb = await generateEmbedding(data.newMemory.content);
        // P2-10: 在 relevanceTags 中加入当前 threadId
        await memoryStore.createMemory({
          memoryType: (data.newMemory.type as "lesson" | "pattern" | "preference" | "fact") || "lesson",
          content: data.newMemory.content,
          relevanceTags: [thread.id, ...thread.tags],
          embedding: emb,
        });
        newMemCount = 1;
      } catch (e) {
        logSwallowed("cognitiveGraph.reflect.embedding", e);
      }
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

  if (shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
    return { errors: ["review: 熔断 — 跳过"] };
  }

  try {
    const dueTheses = await thesisStore.getDueReviews();
    if (dueTheses.length === 0) return {};

    let totalTokens = 0;
    const traces: ReasoningTrace[] = [];

    for (const thread of dueTheses.slice(0, 3)) {
      try {
        // P1-6: 获取 thesis 关联资产的价格变动作为 ground truth
        let priceChangeText = "";
        if (thread.assetKeys[0]) {
          try {
            const sym = thread.assetKeys[0].split(":")[1] ?? thread.assetKeys[0];
            const createdDate = new Date(thread.createdAt);
            const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / 86400000);
            if (daysSinceCreation > 0 && sym) {
              const cacheResult = await fetchPriceSeriesWithCache(sym, `${Math.min(daysSinceCreation + 5, 365)}d`);
              const series = cacheResult?.data ?? [];
              if (series.length >= 2) {
                const firstPrice = series[0].close;
                const lastPrice = series[series.length - 1].close;
                const changePct = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(1);
                priceChangeText = `\n该资产在论点存续期间(${daysSinceCreation}天)内涨跌幅为 ${changePct}%（从 $${firstPrice.toFixed(2)} 到 $${lastPrice.toFixed(2)}）`;
              }
            }
          } catch (e) {
            logSwallowed("cognitiveGraph.review.priceChange", e);
          }
        }

        const prompt = buildReviewPrompt({
          thread,
          marketRegime: state.market?.regime ?? "unknown",
          vix: state.market?.vix ?? null,
          priceChangeText,
        });

        const { data, tokensUsed } = await callDeepSeekJson<{
          actualOutcome: string;
          accuracyScore: number;
          lesson: string | null;
          shouldArchive: boolean;
        }>(prompt, "cognitiveGraph.review");

        totalTokens += tokensUsed;

        // P0-2: 校验 review 输出
        if (data) {
          const valErrors = validateShape(data, { actualOutcome: "string", accuracyScore: "number", shouldArchive: "boolean" });
          if (valErrors.length > 0) {
            logSwallowed(`cognitiveGraph.review.validation.${thread.id}`, new Error(valErrors.join("; ")));
          }
        }

        if (data) {
          // 保存复盘记录（通过 store 层）
          await thesisStore.createThesisReview({
            threadId: thread.id,
            reviewWindow: "30d",
            thesisAtTime: thread.thesisText,
            convictionAtTime: thread.conviction,
            actualOutcome: data.actualOutcome,
            accuracyScore: data.accuracyScore,
            lessonsLearned: data.lesson,
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

// ── Surface 节点（生成 DailyBriefing + 可选 TG 推送）──

async function surfaceNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    const theses = await thesisStore.getActiveTheses();
    const memCount = await memoryStore.countMemories();

    // P0-3: 读取上次成功运行的 briefing 用于对比
    let previousBriefing: { mindChangeConditions: MindChangeCondition[]; cognitionGaps: CognitionGap[] } | null = null;
    try {
      const lastRun = await getLatestRun();
      if (lastRun?.briefing) {
        previousBriefing = {
          mindChangeConditions: lastRun.briefing.mindChangeConditions ?? [],
          cognitionGaps: lastRun.briefing.cognitionGaps ?? [],
        };
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.surface.previousBriefing", e);
    }

    let data: { surprises: Surprise[]; cognitionGaps: CognitionGap[]; mindChangeConditions: MindChangeCondition[] } | null = null;
    let tokensUsed = 0;

    // 熔断检查 — surface 节点跳过 LLM 但仍生成基本 briefing
    if (!shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      const prompt = buildSurfacePrompt({
        portfolio: state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 },
        market: state.market ?? { regime: "unknown", vix: null, indicators: {} },
        theses,
        surprises: state.surprises ?? [],
        thesesUpdated: state.thesesUpdated ?? 0,
        memoriesCreated: state.memoriesCreated ?? 0,
        toolsCalled: state.toolsCalled ?? [],
        reasoningTraces: state.reasoningTraces ?? [],
        previousBriefing,
      });

      const llmResult = await callDeepSeekJson<{
        surprises: Surprise[];
        cognitionGaps: CognitionGap[];
        mindChangeConditions: MindChangeCondition[];
      }>(prompt, "cognitiveGraph.surface");
      data = llmResult.data;
      tokensUsed = llmResult.tokensUsed;

      // P0-2: 校验 surface 输出
      if (data) {
        const valErrors = validateShape(data, { surprises: "array", cognitionGaps: "array", mindChangeConditions: "array" });
        if (valErrors.length > 0) {
          logSwallowed("cognitiveGraph.surface.validation", new Error(valErrors.join("; ")));
          // 保留有效部分
          if (!Array.isArray(data.surprises)) data.surprises = [];
          if (!Array.isArray(data.cognitionGaps)) data.cognitionGaps = [];
          if (!Array.isArray(data.mindChangeConditions)) data.mindChangeConditions = [];
        }
      }
    }

    // Feature B: 组合级风险建模（纯计算，无 LLM）
    const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
    const thesisFailureImpacts: ThesisFailureImpact[] = [];
    for (const t of theses) {
      if (t.conviction !== "high" && t.conviction !== "medium") continue;
      const affected = portfolio.holdings.filter(h => t.assetKeys.includes(h.assetKey));
      if (affected.length === 0) continue;
      const totalExposurePct = affected.reduce((sum, h) => sum + h.weightPct, 0);
      const lossMultiplier = t.conviction === "high" ? 0.5 : 0.3;
      const estimatedLossPct = totalExposurePct * lossMultiplier;
      const riskLevel = estimatedLossPct > 0.15 ? "critical" : estimatedLossPct > 0.1 ? "high" : estimatedLossPct > 0.05 ? "medium" : "low";
      thesisFailureImpacts.push({
        threadId: t.id,
        thesisTitle: t.title,
        conviction: t.conviction,
        affectedAssets: affected.map(h => ({ assetKey: h.assetKey, weightPct: h.weightPct })),
        totalExposurePct,
        estimatedLossPct,
        riskLevel,
      });
    }

    // Feature C: Thesis 冲突检测（代码层 — 资产重叠 + conviction 矛盾）
    const thesisConflicts: ThesisConflict[] = [];
    for (let i = 0; i < theses.length; i++) {
      for (let j = i + 1; j < theses.length; j++) {
        const a = theses[i];
        const b = theses[j];
        const overlap = a.assetKeys.filter(k => b.assetKeys.includes(k));
        if (overlap.length === 0) continue;
        // 方向矛盾：一个 high/medium，另一个 low/uncertain
        const aPositive = a.conviction === "high" || a.conviction === "medium";
        const bPositive = b.conviction === "high" || b.conviction === "medium";
        if (aPositive === bPositive) continue; // 同方向不冲突
        const severity = overlap.length >= 2 ? "high" : aPositive && a.conviction === "high" ? "high" : "medium";
        thesisConflicts.push({
          thesisA: { id: a.id, title: a.title, conviction: a.conviction },
          thesisB: { id: b.id, title: b.title, conviction: b.conviction },
          conflictType: "directional",
          overlappingAssets: overlap,
          severity,
          llmAssessment: null,
        });
      }
    }

    const totalTkn = (state.totalTokens ?? 0) + tokensUsed;

    // Phase 4: 汇总子 agent 结果
    const subAgentSummaries = (state.subAgentResults ?? []).length > 0
      ? (state.subAgentResults ?? []).map(r => ({
          threadId: r.threadId,
          threadTitle: r.threadTitle,
          summary: r.summary,
          thesisChanged: r.thesisChanged,
          toolsUsed: r.toolsUsed,
        }))
      : undefined;

    const briefing: DailyBriefing = {
      surprises: data?.surprises ?? state.surprises ?? [],
      cognitionGaps: data?.cognitionGaps ?? [],
      mindChangeConditions: data?.mindChangeConditions ?? [],
      thesisFailureImpacts,
      thesisConflicts,
      subAgentSummaries,
      thesesUpdated: state.thesesUpdated ?? 0,
      memoriesCreated: state.memoriesCreated ?? 0,
      totalTokens: totalTkn,
      estimatedCost: totalTkn * DEEPSEEK_AVG_COST_PER_TOKEN,
    };

    // 策略顾问 LLM — 生成 Agent Config Overlay（仅在 agentOverlayEnabled 时）
    if (state.agentConfig?.agentOverlayEnabled && !shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      try {
        const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
        const advisorPrompt = buildStrategyAdvisorPrompt({
          holdings: portfolio.holdings.map(h => ({
            assetKey: h.assetKey,
            symbol: h.assetKey.split(":").pop() ?? h.assetKey,
            weightPct: h.weightPct,
            price: h.lastPrice ?? 0,
          })),
          theses,
          surprises: briefing.surprises,
          cognitionGaps: briefing.cognitionGaps,
          ruleRegime: state.market?.regime ?? "unknown",
          defaultDriftThresholdPct: state.agentConfig?.defaultDriftThresholdPct ?? 0.05,
          maxPositionPct: state.agentConfig?.maxPositionPct ?? 0.30,
        });

        const overlayResult = await callDeepSeekJson<Omit<AgentConfigOverlay, "generatedAt" | "agentRunId">>(
          advisorPrompt, "cognitiveGraph.surface.advisor",
        );
        tokensUsed += overlayResult.tokensUsed;

        if (overlayResult.data) {
          const raw = overlayResult.data;
          // 安全校验：clamp 范围
          const driftOverrides = (Array.isArray(raw.driftOverrides) ? raw.driftOverrides : [])
            .filter(o => o.recommendedThresholdPct >= 0.02 && o.recommendedThresholdPct <= 0.15);
          const riskAdjustments = (Array.isArray(raw.riskAdjustments) ? raw.riskAdjustments : [])
            .filter(o => o.maxPositionPctOverride >= 0.10 && o.maxPositionPctOverride <= 0.30);

          briefing.configOverlay = {
            generatedAt: new Date().toISOString(),
            agentRunId: `surface-${new Date().toISOString()}`,
            driftOverrides,
            regimeOverride: raw.regimeOverride && typeof raw.regimeOverride === "object"
              ? { ...raw.regimeOverride, ruleBasedRegime: state.market?.regime ?? "unknown" }
              : null,
            riskAdjustments,
            rebalanceTrigger: raw.rebalanceTrigger && typeof raw.rebalanceTrigger === "object"
              ? raw.rebalanceTrigger
              : null,
          };

          // 更新 briefing token 计数
          briefing.totalTokens += overlayResult.tokensUsed;
          briefing.estimatedCost = briefing.totalTokens * DEEPSEEK_AVG_COST_PER_TOKEN;
        }
      } catch (e) {
        logSwallowed("cognitiveGraph.surface.advisor", e);
      }
    }

    // 尝试推送 Telegram（非阻塞）
    try {
      const { sendTelegramByEnv } = await import("@/src/daa/notify/telegram");
      const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
      const tgText = formatBriefingForTelegram(briefing, {
        totalTokens: briefing.totalTokens,
        durationMs: Date.now() - t0,
        thesesCount: theses.length,
        memoriesCount: memCount,
        portfolio: {
          holdings: portfolio.holdings.map(h => ({
            ...h,
            valuationBase: h.lastPrice * h.holdingQty,
          })),
          totalEquity: portfolio.totalEquity,
          cashPct: portfolio.cashPct,
          marketRegime: state.market?.regime ?? undefined,
        },
      });
      sendTelegramByEnv(tgText, {
        eventType: "agent_briefing",
        triggerSource: "cognitive_agent",
        parseMode: "HTML",
      }).catch(e => logSwallowed("cognitiveGraph.surface.telegram", e));
    } catch (e) {
      logSwallowed("cognitiveGraph.surface.telegramImport", e);
    }

    return {
      briefing, // 将完整 briefing 传入状态
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "surface",
        threadId: null,
        input: `${theses.length} theses, ${(state.surprises ?? []).length} surprises`,
        output: `briefing: ${briefing.surprises.length} surprises, ${briefing.cognitionGaps.length} gaps, ${briefing.mindChangeConditions.length} conditions`,
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.surface", e);
    return { errors: [`surface: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ── Learn 节点（Phase 2: 策略学习 — review 后提炼调查策略模板）──

async function learnNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    // 前置条件：本次 cycle 有实际调查产出
    if ((state.thesesUpdated ?? 0) === 0 && (state.memoriesCreated ?? 0) === 0) {
      return {}; // 无有效产出，跳过学习
    }

    const { extractStrategyFromRun } = await import("@/src/daa/agent/learning/strategyExtractor");

    // 从当前 cycle 的工具调用记录中提炼策略
    const toolsCalled = state.toolsCalled ?? [];
    const result = await extractStrategyFromRun({
      runId: `cycle_${Date.now()}`, // 临时 ID，后续由 agentRunStore 补全
      toolsCalled: toolsCalled.map(tc => ({
        tool: tc.tool,
        input: tc.input,
        outputSummary: tc.outputSummary,
      })),
      thesesUpdated: state.thesesUpdated ?? 0,
      surprises: (state.surprises ?? []).length,
      regime: state.market?.regime ?? "unknown",
      targetConvictions: state.activeTheses
        .filter(t => (state.investigationQueue ?? []).some(q => q.threadId === t.id))
        .map(t => t.conviction),
    });

    if (result.created) {
      logSwallowed("cognitiveGraph.learn.created", new Error(`策略已提炼: ${result.strategyName}`));
    }

    return {
      toolsCalled: [{
        tool: "learn",
        input: {},
        outputSummary: result.created ? `策略提炼: ${result.strategyName}` : "无新策略",
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.learn", e);
    return {};
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
    .addNode("learn", learnNode)   // Phase 2: 策略学习节点
    .addNode("surface", surfaceNode)
    .addEdge(START, "observe")
    .addEdge("observe", "prioritize")
    .addConditionalEdges("prioritize", (state: CognitiveState) => {
      if (state.currentTarget && state.currentThread) return "investigate";
      return "review"; // 无调查目标 → 跳到复盘
    })
    .addConditionalEdges("investigate", (state: CognitiveState) => {
      if (state.investigateResult?.thesisChanged) return "reflect";
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
    // Phase 2: review → learn → surface（learn 节点提炼策略模板）
    .addEdge("review", "learn")
    .addEdge("learn", "surface")
    .addEdge("surface", END);

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

  // V2: 初始化 cycle 级状态
  clearToolResultCache();     // 清空工具结果缓存
  setCurrentRunId(run.id);    // 设置 runId 供工具执行日志关联

  try {
    const graph = getCognitiveGraph();
    const result = await graph.invoke(
      {}, // 初始状态为空，observe 节点会填充
      { configurable: { thread_id: threadId } },
    );

    const durationMs = Date.now() - t0;
    // 使用 surfaceNode 生成的完整 briefing（含 cognitionGaps + mindChangeConditions）
    const totalTkn = result.totalTokens ?? 0;
    const briefing: DailyBriefing = result.briefing ?? {
      surprises: result.surprises ?? [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: result.thesesUpdated ?? 0,
      memoriesCreated: result.memoriesCreated ?? 0,
      totalTokens: totalTkn,
      estimatedCost: totalTkn * DEEPSEEK_AVG_COST_PER_TOKEN,
    };
    await completeAgentRun(run.id, {
      status: (result.errors?.length ?? 0) > 0 ? "completed_with_errors" : "completed",
      targetThreadIds: result.investigationQueue?.map((t: InvestigationTarget) => t.threadId).filter(Boolean) as string[] ?? [],
      toolsCalled: result.toolsCalled ?? [],
      reasoningTraces: result.reasoningTraces ?? [],
      surprises: result.surprises ?? [],
      briefing,
      totalTokens: totalTkn,
      totalCostUsd: briefing.estimatedCost,
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
