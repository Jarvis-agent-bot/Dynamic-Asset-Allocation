/**
 * 单标的「放量突破」择时回测服务（DAA 集成层）
 * ============================================================
 * 把纯函数引擎 src/core/backtestSingleNameBreakout 接入 DAA：
 *   - 数据：复用 fetchPriceSeriesWithCache（candle DB 优先 + Yahoo 补齐，1d OHLCV）
 *   - 持久化：复用 daa_strategy_lab_run_snapshots 表（用 request_json.mode = "breakout" 区分）
 *   - 组合层：在逐笔成交之上做"最多 N 仓 + 每笔风险 r% + 单仓上限"的资金曲线模拟
 *
 * 与 runStrategyLabBacktest（组合再平衡）并列，互不影响。
 * 不构成投资建议；回测是历史统计，不代表未来。
 */

import { randomUUID } from "node:crypto";

import {
  backtestSingleNameBreakout,
  computeBreakoutStats,
  DEFAULT_BREAKOUT_PARAMS,
  type BreakoutParams,
  type BreakoutTrade,
  type OhlcvBar,
} from "@/src/core/backtestSingleNameBreakout";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { buildDaaAssetKey, parseDaaAssetKey } from "@/src/daa/assetKey";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type BreakoutLabRunParams = {
  /** 资产列表，格式 MARKET::SYMBOL（如 US::AAPL）或纯 symbol（默认 US 市场） */
  assets: string[];
  /** 起始日期 YYYY-MM-DD */
  startDate: string;
  /** 结束日期 YYYY-MM-DD */
  endDate: string;
  /** 初始资金 */
  initialCapital: number;
  /** 每笔风险占账户比例（默认 0.01 = 1%） */
  riskPct?: number;
  /** 最多同时持仓数（默认 3） */
  maxSlots?: number;
  /** 单仓金额上限（默认无上限 = initialCapital） */
  maxPositionUsd?: number;
  /** 策略参数（覆盖默认值） */
  strategy?: Partial<BreakoutParams>;
};

export type BreakoutLabPerSymbol = {
  assetKey: string;
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  totalR: number;
  warnings: string[];
};

export type BreakoutLabEquityPoint = { date: string; equity: number };

export type BreakoutLabPortfolio = {
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  tradesTaken: number;
  tradesSkippedSlotsFull: number;
  equityCurve: BreakoutLabEquityPoint[];
};

export type BreakoutLabRunResult = {
  runId: string;
  createdAt: string;
  mode: "breakout";
  params: BreakoutLabRunParams;
  resolvedParams: BreakoutParams;
  /** 全部成交合并后的单笔统计 */
  aggregate: ReturnType<typeof computeBreakoutStats>;
  perSymbol: BreakoutLabPerSymbol[];
  trades: BreakoutTrade[];
  portfolio: BreakoutLabPortfolio;
  benchmark: { symbol: string; buyHoldReturnPct: number | null } | null;
  warnings: string[];
};

export class BreakoutLabDomainError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  constructor(code: string, message: string, options: { status?: number; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "BreakoutLabDomainError";
    this.code = code;
    this.status = options.status ?? 422;
    this.details = options.details ?? {};
  }
}

type ResolvedAsset = { assetKey: string; market: string; symbol: string; currency: string; yfinanceSymbol: string };

function inferCurrency(market: string): string {
  const m = market.toUpperCase();
  return { HK: "HKD", CN: "CNY", KR: "KRW", TW: "TWD", JP: "JPY", SG: "SGD", UK: "GBP", EU: "EUR" }[m] || "USD";
}

function resolveAsset(raw: string): ResolvedAsset | null {
  const parsed = parseDaaAssetKey(raw);
  const market = parsed?.market || "US";
  const symbol = parsed?.symbol || String(raw || "").trim().toUpperCase();
  if (!symbol) return null;
  const assetKey = buildDaaAssetKey(symbol, market);
  if (!assetKey) return null;
  return { assetKey, market, symbol, currency: inferCurrency(market), yfinanceSymbol: toYfinanceSymbolByMarket(symbol, market) };
}

async function fetchOhlcv(
  asset: ResolvedAsset,
  startDate: string,
  endDate: string,
  warnings: string[],
): Promise<OhlcvBar[]> {
  if (!asset.yfinanceSymbol) {
    warnings.push(`无法映射 yfinance symbol: ${asset.assetKey}`);
    return [];
  }
  try {
    const result = await fetchPriceSeriesWithCache(asset.yfinanceSymbol, startDate, {
      market: asset.market,
      currency: asset.currency,
      interval: "1d",
      requireOhlcv: true, // 放量突破必须有真实 OHLCV
      minDbDays: 60,
      timeoutMs: 10000,
    });
    if (result.error && result.data.length === 0) {
      warnings.push(`获取 ${asset.assetKey} 行情失败: ${result.error}`);
      return [];
    }
    const bars: OhlcvBar[] = [];
    for (const p of result.data) {
      if (p.date < startDate || p.date > endDate) continue;
      if (
        p.open == null || p.high == null || p.low == null ||
        !Number.isFinite(p.open) || !Number.isFinite(p.high) || !Number.isFinite(p.low) || !Number.isFinite(p.close)
      ) {
        continue; // 跳过没有完整 OHLC 的点（close-only fallback）
      }
      bars.push({
        date: p.date,
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
        volume: Number(p.volume ?? 0),
      });
    }
    if (bars.length === 0) {
      warnings.push(`资产 ${asset.assetKey} 在区间内缺少完整 OHLCV（突破策略需要 high/low/volume）`);
    }
    return bars;
  } catch (err) {
    logSwallowed(`breakoutLab.fetchOhlcv(${asset.yfinanceSymbol})`, err);
    warnings.push(`获取 ${asset.assetKey} 行情异常: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * 组合层资金模拟：按进场日期排序，最多 maxSlots 同时持仓，
 * 每笔风险 = 当前权益 × riskPct，仓位金额受 maxPositionUsd 上限约束，
 * 平仓时按 R × 实际风险金额结算盈亏。
 */
function simulatePortfolio(
  trades: BreakoutTrade[],
  params: BreakoutLabRunParams,
): BreakoutLabPortfolio {
  const initial = params.initialCapital;
  const riskPct = params.riskPct ?? 0.01;
  const maxSlots = params.maxSlots ?? 3;
  const maxPos = params.maxPositionUsd ?? initial;

  const sorted = [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  let equity = initial;
  let peak = initial;
  let maxDd = 0;
  let taken = 0;
  let skipped = 0;
  let openExitDates: string[] = [];
  const equityCurve: BreakoutLabEquityPoint[] = [{ date: params.startDate, equity: round2(initial) }];

  for (const tr of sorted) {
    // 释放在本笔进场前已平仓的槽位
    openExitDates = openExitDates.filter((d) => d > tr.entryDate);
    if (openExitDates.length >= maxSlots) {
      skipped += 1;
      continue;
    }
    const rps = tr.entry - tr.stop;
    if (rps <= 0) continue;
    const riskDollar = equity * riskPct;
    let shares = riskDollar / rps;
    if (shares * tr.entry > maxPos) shares = maxPos / tr.entry;
    const actualRisk = shares * rps;
    const pnl = tr.r * actualRisk;
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    openExitDates.push(tr.exitDate);
    taken += 1;
    equityCurve.push({ date: tr.exitDate, equity: round2(equity) });
  }

  return {
    initialCapital: initial,
    finalEquity: round2(equity),
    totalReturnPct: round2((equity / initial - 1) * 100),
    maxDrawdownPct: round2(maxDd * 100),
    tradesTaken: taken,
    tradesSkippedSlotsFull: skipped,
    equityCurve,
  };
}

async function computeBenchmarkBuyHold(
  symbolRaw: string,
  startDate: string,
  endDate: string,
  warnings: string[],
): Promise<number | null> {
  const asset = resolveAsset(symbolRaw);
  if (!asset) return null;
  const bars = await fetchOhlcv(asset, startDate, endDate, warnings);
  if (bars.length < 2) return null;
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  if (first <= 0) return null;
  return round2((last / first - 1) * 100);
}

export async function runBreakoutLabBacktest(params: BreakoutLabRunParams): Promise<BreakoutLabRunResult> {
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const warnings: string[] = [];

  const assets = (params.assets || []).map(resolveAsset).filter((a): a is ResolvedAsset => Boolean(a?.assetKey));
  if (!assets.length) {
    throw new BreakoutLabDomainError("NO_ASSETS", "至少需要一个资产", { status: 400 });
  }
  const resolvedParams: BreakoutParams = { ...DEFAULT_BREAKOUT_PARAMS, ...(params.strategy || {}) };

  const allTrades: BreakoutTrade[] = [];
  const perSymbol: BreakoutLabPerSymbol[] = [];

  // 逐只拉数据 + 回测（顺序执行，避免 Yahoo 限流）
  for (const asset of assets) {
    const bars = await fetchOhlcv(asset, params.startDate, params.endDate, warnings);
    const res = backtestSingleNameBreakout(asset.assetKey, bars, resolvedParams);
    for (const w of res.warnings) warnings.push(w);
    if (res.trades.length) allTrades.push(...res.trades);
    const s = res.stats;
    perSymbol.push({
      assetKey: asset.assetKey,
      trades: s?.trades ?? 0,
      winRate: s?.winRate ?? 0,
      expectancy: s?.expectancy ?? 0,
      profitFactor: s?.profitFactor ?? 0,
      totalR: s?.totalR ?? 0,
      warnings: res.warnings,
    });
  }

  if (!allTrades.length) {
    throw new BreakoutLabDomainError("NO_TRADES", "所选资产在该区间没有任何放量突破信号成交（可能数据不足或参数过严）", {
      status: 422,
      details: { warnings, perSymbol },
    });
  }

  const aggregate = computeBreakoutStats(allTrades);
  const portfolio = simulatePortfolio(allTrades, params);

  let benchmark: BreakoutLabRunResult["benchmark"] = null;
  const buyHold = await computeBenchmarkBuyHold("US::QQQ", params.startDate, params.endDate, warnings);
  benchmark = { symbol: "QQQ", buyHoldReturnPct: buyHold };

  const result: BreakoutLabRunResult = {
    runId,
    createdAt,
    mode: "breakout",
    params,
    resolvedParams,
    aggregate,
    perSymbol: perSymbol.sort((a, b) => b.totalR - a.totalR),
    trades: allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
    portfolio,
    benchmark,
    warnings,
  };

  // 持久化（复用既有快照表，mode 区分）
  try {
    await withDaaPgClient(async ({ query }) => {
      await query(
        `INSERT INTO daa_strategy_lab_run_snapshots
           (run_id, created_at, base_currency, start_date, end_date, request_json, summary_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          runId,
          createdAt,
          "USD",
          params.startDate,
          params.endDate,
          JSON.stringify({ mode: "breakout", ...params, resolvedParams }),
          JSON.stringify({
            mode: "breakout",
            aggregate,
            portfolio: { ...portfolio, equityCurve: undefined },
            benchmark,
            symbolCount: assets.length,
          }),
        ],
      );
    });
  } catch (err) {
    logSwallowed("breakoutLab.saveSnapshot", err);
    warnings.push("回测结果保存失败，但计算结果仍然可用");
  }

  return result;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
