/**
 * Cognitive Agent OS — LangGraph 工作流
 *
 * 完整循环：observe → prioritize → investigate → reflect → (next_target → investigate)* → review → END
 */

import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { CognitiveStateAnnotation, type CognitiveState, type CognitiveUpdate, type PortfolioSnapshot, type MarketSnapshot, type NewsSnapshot } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, InvestigateOutput, Surprise, ReasoningTrace, ToolCallRecord, ResearchThread, DailyBriefing, CognitionGap, MindChangeCondition } from "@/src/daa/agent/cognitiveTypes";
import { buildPrioritizePrompt, buildInvestigatePrompt, buildReflectPrompt, buildReviewPrompt, buildSurfacePrompt, formatBriefingForTelegram } from "@/src/daa/agent/cognitivePrompts";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";

import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 工具导入（现有信号生成器 + 数据服务） ──

import { buildTechnicalSignalForSymbol } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignalForSymbol } from "@/src/daa/signals/valuationSignal";
import { buildNewsSignalForSymbol } from "@/src/daa/signals/newsSignal";
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
    return { investigateResult: null }; // 无目标，清除 stale 结果
  }

  try {
    // 熔断检查（读取配置阈值）
    if (shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      return { errors: ["investigate: 熔断 — 连续 LLM 失败次数过多，跳过"] };
    }

    // 1. 收集证据（P2-11: 并行调用工具）
    const evidence: Record<string, unknown> = {};
    const newToolsCalled: ToolCallRecord[] = [];
    const symbol = thread.assetKeys[0]?.split(":")[1] ?? thread.assetKeys[0] ?? "";
    const market = thread.assetKeys[0]?.split(":")[0] ?? "US";

    const toolPromises: Array<{ name: string; promise: Promise<unknown>; t0: number }> = [];
    for (const toolName of target.dataNeeded) {
      if (!thread.assetKeys[0]) continue;
      const toolT0 = Date.now();
      if (toolName === "technical") {
        toolPromises.push({ name: toolName, t0: toolT0, promise: buildTechnicalSignalForSymbol(symbol).catch(e => { logSwallowed(`cognitiveGraph.investigate.tool.${toolName}`, e); return null; }) });
      } else if (toolName === "valuation") {
        toolPromises.push({ name: toolName, t0: toolT0, promise: buildValuationSignalForSymbol(symbol).catch(e => { logSwallowed(`cognitiveGraph.investigate.tool.${toolName}`, e); return null; }) });
      } else if (toolName === "news") {
        toolPromises.push({ name: toolName, t0: toolT0, promise: buildNewsSignalForSymbol(symbol, market).catch(e => { logSwallowed(`cognitiveGraph.investigate.tool.${toolName}`, e); return null; }) });
      }
    }

    // 并行等待所有信号
    const results = await Promise.allSettled(toolPromises.map(p => p.promise));
    for (let i = 0; i < toolPromises.length; i++) {
      const { name: toolName, t0: toolT0 } = toolPromises[i];
      const result = results[i];
      const signal = result.status === "fulfilled" ? result.value : null;

      if (toolName === "technical" && signal && typeof signal === "object") {
        const s = signal as Record<string, unknown>;
        evidence.technical = { scorePct: s.scorePct, momentumRegime: s.momentumRegime, metrics: s.metrics, reasons: s.reasons };
      } else if (toolName === "valuation" && signal && typeof signal === "object") {
        const s = signal as Record<string, unknown>;
        evidence.valuation = { scorePct: s.scorePct, temperature: s.temperature, metrics: s.metrics, reasons: s.reasons };
      } else if (toolName === "news" && signal && typeof signal === "object") {
        const s = signal as Record<string, unknown>;
        evidence.news = { scorePct: s.scorePct, evidenceCount: s.evidenceCount, llmSummary: s.llmSummary, llmDrivers: s.llmDrivers, llmMajorEvent: s.llmMajorEvent, reasons: s.reasons, items: Array.isArray(s.items) ? (s.items as Array<Record<string, unknown>>).slice(0, 5).map(i => ({ title: i.title, ts: i.ts })) : [] };
      } else if (!signal) {
        evidence[toolName] = { error: result.status === "rejected" ? String(result.reason) : "null result" };
      }

      newToolsCalled.push({
        tool: toolName,
        input: { assetKeys: thread.assetKeys },
        outputSummary: evidence[toolName] && !(evidence[toolName] as Record<string, unknown>).error ? "ok" : "failed",
        durationMs: Date.now() - toolT0,
      });
    }

    // 2. 检索相关记忆（P2-10: 带 thesis 关联）
    const queryEmb = await generateEmbedding(thread.title + " " + thread.thesisText);
    const memories = await memoryStore.recallMemory({ queryEmbedding: queryEmb, tags: [thread.id, ...thread.tags], limit: state.agentConfig?.memoryRecallLimit ?? 5 });

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

    // P0-2: 校验 investigate 输出
    if (result) {
      const valErrors = validateShape(result, { thesisChanged: "boolean", evidenceType: "string", evidenceSummary: "string" });
      if (valErrors.length > 0) {
        logSwallowed("cognitiveGraph.investigate.validation", new Error(valErrors.join("; ")));
      }
    }

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
    const briefing: DailyBriefing = {
      surprises: data?.surprises ?? state.surprises ?? [],
      cognitionGaps: data?.cognitionGaps ?? [],
      mindChangeConditions: data?.mindChangeConditions ?? [],
      thesisFailureImpacts,
      thesisConflicts,
      thesesUpdated: state.thesesUpdated ?? 0,
      memoriesCreated: state.memoriesCreated ?? 0,
      totalTokens: totalTkn,
      estimatedCost: totalTkn * DEEPSEEK_AVG_COST_PER_TOKEN,
    };

    // 尝试推送 Telegram（非阻塞）
    try {
      const { sendTelegramByEnv } = await import("@/src/daa/notify/telegram");
      const tgText = formatBriefingForTelegram(briefing, {
        totalTokens: briefing.totalTokens,
        durationMs: Date.now() - t0,
        thesesCount: theses.length,
        memoriesCount: memCount,
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

// ── Graph 组装 ──

function buildCognitiveGraph() {
  const graph = new StateGraph(CognitiveStateAnnotation)
    .addNode("observe", observeNode)
    .addNode("prioritize", prioritizeNode)
    .addNode("investigate", investigateNode)
    .addNode("reflect", reflectNode)
    .addNode("next_target", loadNextTarget)
    .addNode("review", reviewNode)
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
    .addEdge("review", "surface")
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
