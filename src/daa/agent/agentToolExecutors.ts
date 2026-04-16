/**
 * Agent Tool Executors — Phase 3 ReAct Agent 工具执行器
 *
 * @deprecated V1 执行器 — 已被 `src/daa/agent/tools/observe/` 各文件替代。
 * V2 工具使用 ToolExecutionContext 注入 state 数据，不再需要闭包构建。
 * 此文件保留用于过渡期 fallback，将在后续版本移除。
 *
 * 工具列表（6 个）：
 * 1. fetch_technical_signal — 技术信号
 * 2. fetch_valuation_signal — 估值信号
 * 3. fetch_news_signal — 新闻信号
 * 4. fetch_human_signal — 人因信号（基金经理持仓）
 * 5. query_market_regime — 市场环境
 * 6. query_portfolio_concentration — 组合集中度
 */

import type { AgentToolResult, AgentToolExecutor } from "@/src/daa/agent/agentToolRegistry";
import type { PortfolioSnapshot, MarketSnapshot } from "@/src/daa/agent/cognitiveState";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ─── 工具执行超时 ────────────────────────────────────────────────

const TOOL_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`工具 ${toolName} 执行超时 (${timeoutMs}ms)`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

function makeResult(toolName: string, success: boolean, data: unknown, t0: number, error?: string): AgentToolResult {
  return { toolName, success, data, error, latencyMs: Date.now() - t0 };
}

// ─── 1. fetch_technical_signal ────────────────────────────────────

async function executeFetchTechnicalSignal(params: Record<string, unknown>): Promise<AgentToolResult> {
  const t0 = Date.now();
  const symbol = String(params.symbol || "");
  if (!symbol) return makeResult("fetch_technical_signal", false, null, t0, "缺少必填参数 symbol");

  try {
    const { buildTechnicalSignalForSymbol } = await import("@/src/daa/signals/technicalSignal");
    const signal = await withTimeout(buildTechnicalSignalForSymbol(symbol), TOOL_TIMEOUT_MS, "fetch_technical_signal");
    if (!signal) return makeResult("fetch_technical_signal", false, null, t0, `${symbol} 无技术信号数据`);
    return makeResult("fetch_technical_signal", true, {
      scorePct: signal.scorePct,
      momentumRegime: signal.momentumRegime,
      metrics: signal.metrics,
      reasons: signal.reasons,
    }, t0);
  } catch (e) {
    logSwallowed("agentToolExecutor.fetch_technical_signal", e);
    return makeResult("fetch_technical_signal", false, null, t0, e instanceof Error ? e.message : String(e));
  }
}

// ─── 2. fetch_valuation_signal ────────────────────────────────────

async function executeFetchValuationSignal(params: Record<string, unknown>): Promise<AgentToolResult> {
  const t0 = Date.now();
  const symbol = String(params.symbol || "");
  if (!symbol) return makeResult("fetch_valuation_signal", false, null, t0, "缺少必填参数 symbol");

  try {
    const { buildValuationSignalForSymbol } = await import("@/src/daa/signals/valuationSignal");
    const signal = await withTimeout(buildValuationSignalForSymbol(symbol), TOOL_TIMEOUT_MS, "fetch_valuation_signal");
    if (!signal) return makeResult("fetch_valuation_signal", false, null, t0, `${symbol} 无估值信号数据`);
    return makeResult("fetch_valuation_signal", true, {
      scorePct: signal.scorePct,
      temperature: signal.temperature,
      metrics: signal.metrics,
      reasons: signal.reasons,
    }, t0);
  } catch (e) {
    logSwallowed("agentToolExecutor.fetch_valuation_signal", e);
    return makeResult("fetch_valuation_signal", false, null, t0, e instanceof Error ? e.message : String(e));
  }
}

// ─── 3. fetch_news_signal ─────────────────────────────────────────

async function executeFetchNewsSignal(params: Record<string, unknown>): Promise<AgentToolResult> {
  const t0 = Date.now();
  const symbol = String(params.symbol || "");
  if (!symbol) return makeResult("fetch_news_signal", false, null, t0, "缺少必填参数 symbol");

  try {
    const { buildNewsSignalForSymbol } = await import("@/src/daa/signals/newsSignal");
    // 从 symbol 推断 market（简单逻辑）
    const market = symbol.endsWith(".HK") ? "HK" : symbol.endsWith(".SS") || symbol.endsWith(".SZ") ? "CN" : "US";
    const signal = await withTimeout(buildNewsSignalForSymbol(symbol, market), TOOL_TIMEOUT_MS, "fetch_news_signal");
    if (!signal) return makeResult("fetch_news_signal", false, null, t0, `${symbol} 无新闻信号数据`);
    const s = signal as Record<string, unknown>;
    return makeResult("fetch_news_signal", true, {
      scorePct: s.scorePct,
      evidenceCount: s.evidenceCount,
      llmSummary: s.llmSummary,
      llmDrivers: s.llmDrivers,
      llmMajorEvent: s.llmMajorEvent,
      reasons: s.reasons,
      items: Array.isArray(s.items)
        ? (s.items as Array<Record<string, unknown>>).slice(0, 5).map((i) => ({ title: i.title, ts: i.ts }))
        : [],
    }, t0);
  } catch (e) {
    logSwallowed("agentToolExecutor.fetch_news_signal", e);
    return makeResult("fetch_news_signal", false, null, t0, e instanceof Error ? e.message : String(e));
  }
}

// ─── 4. fetch_human_signal ────────────────────────────────────────

async function executeFetchHumanSignal(params: Record<string, unknown>): Promise<AgentToolResult> {
  const t0 = Date.now();
  const symbol = String(params.symbol || "");
  if (!symbol) return makeResult("fetch_human_signal", false, null, t0, "缺少必填参数 symbol");

  try {
    const { getLatestHumanSignalBatch } = await import("@/src/daa/hf/hfService");
    const batch = await withTimeout(
      getLatestHumanSignalBatch({ symbols: [symbol], autoIngestOnMiss: false }),
      TOOL_TIMEOUT_MS,
      "fetch_human_signal",
    );
    const signals = batch.signals?.filter((s) => s.symbol === symbol) ?? [];
    if (signals.length === 0) {
      return makeResult("fetch_human_signal", true, { symbol, hasData: false, message: `${symbol} 无人因信号数据` }, t0);
    }
    const sig = signals[0];
    return makeResult("fetch_human_signal", true, {
      symbol: sig.symbol,
      aggregatedScorePct: sig.aggregatedScorePct,
      convictionPct: sig.convictionPct,
      stance: sig.stance,
      momentumRegime: sig.momentumRegime,
      evidenceCount: sig.evidenceCount,
      riskTags: sig.riskTags,
    }, t0);
  } catch (e) {
    logSwallowed("agentToolExecutor.fetch_human_signal", e);
    return makeResult("fetch_human_signal", false, null, t0, e instanceof Error ? e.message : String(e));
  }
}

// ─── 5. query_market_regime ───────────────────────────────────────

/** 需要外部注入 state.market */
function createMarketRegimeExecutor(market: MarketSnapshot | null): AgentToolExecutor {
  return async (_params: Record<string, unknown>): Promise<AgentToolResult> => {
    const t0 = Date.now();
    if (!market) return makeResult("query_market_regime", false, null, t0, "市场数据未加载");
    return makeResult("query_market_regime", true, {
      regime: market.regime,
      vix: market.vix,
      indicators: market.indicators,
    }, t0);
  };
}

// ─── 6. query_portfolio_concentration ─────────────────────────────

/** 需要外部注入 state.portfolio */
function createPortfolioConcentrationExecutor(portfolio: PortfolioSnapshot | null): AgentToolExecutor {
  return async (_params: Record<string, unknown>): Promise<AgentToolResult> => {
    const t0 = Date.now();
    if (!portfolio || portfolio.holdings.length === 0) {
      return makeResult("query_portfolio_concentration", false, null, t0, "组合数据未加载或无持仓");
    }

    const weights = portfolio.holdings.map((h) => h.weightPct);
    // HHI = Σ(wi²)，weightPct 在 observeNode 中是小数形式（0.0-1.0）
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    const maxWeight = Math.max(...weights);
    // 避免 sort 原地突变（P2-11）
    const topHoldings = [...portfolio.holdings]
      .sort((a, b) => b.weightPct - a.weightPct)
      .slice(0, 5)
      .map((h) => ({ symbol: h.symbol, weightPct: h.weightPct }));

    return makeResult("query_portfolio_concentration", true, {
      hhi: Math.round(hhi * 10000) / 10000,
      hhiLabel: hhi >= 0.25 ? "高度集中" : hhi >= 0.15 ? "中度集中" : "适度分散",
      maxPositionWeightPct: maxWeight,
      holdingsCount: portfolio.holdings.length,
      cashPct: portfolio.cashPct,
      totalEquity: portfolio.totalEquity,
      topHoldings,
    }, t0);
  };
}

// ─── Executor 注册表 ──────────────────────────────────────────────

/** 静态 executor（不依赖 state） */
const STATIC_EXECUTORS: Record<string, AgentToolExecutor> = {
  fetch_technical_signal: executeFetchTechnicalSignal,
  fetch_valuation_signal: executeFetchValuationSignal,
  fetch_news_signal: executeFetchNewsSignal,
  fetch_human_signal: executeFetchHumanSignal,
};

/**
 * 构建完整的 executor 注册表。
 *
 * 静态工具直接注册，state-dependent 工具通过闭包注入当前 state。
 */
export function buildExecutorRegistry(ctx: {
  market: MarketSnapshot | null;
  portfolio: PortfolioSnapshot | null;
}): Record<string, AgentToolExecutor> {
  return {
    ...STATIC_EXECUTORS,
    query_market_regime: createMarketRegimeExecutor(ctx.market),
    query_portfolio_concentration: createPortfolioConcentrationExecutor(ctx.portfolio),
  };
}

/**
 * 执行单个工具调用。
 *
 * @returns AgentToolResult — 永远不会抛出异常
 */
export async function executeToolCall(
  registry: Record<string, AgentToolExecutor>,
  toolName: string,
  params: Record<string, unknown>,
): Promise<AgentToolResult> {
  const t0 = Date.now();
  const executor = registry[toolName];
  if (!executor) {
    return makeResult(toolName, false, null, t0, `未知工具: ${toolName}`);
  }
  try {
    return await executor(params);
  } catch (e) {
    logSwallowed(`agentToolExecutor.${toolName}`, e);
    return makeResult(toolName, false, null, t0, e instanceof Error ? e.message : String(e));
  }
}
