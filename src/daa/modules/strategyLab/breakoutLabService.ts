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
import { assertIsoDateString } from "@/src/core/isoDate";
import type { PriceBar } from "@/src/core/domain";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { normalizeMoneyCurrency } from "@/src/daa/modules/money/money";
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
  /** 基准货币；默认推断为首个资产币种 */
  baseCurrency?: string;
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
  baseCurrency: string;
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  tradesTaken: number;
  tradesSkippedSlotsFull: number;
  tradesSkippedCapitalLimited: number;
  equityCurve: BreakoutLabEquityPoint[];
};

export type BreakoutLabRunResult = {
  runId: string;
  createdAt: string;
  mode: "breakout";
  baseCurrency: string;
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

function validateBreakoutParams(params: BreakoutLabRunParams) {
  try {
    assertIsoDateString(params.startDate, "startDate");
  } catch {
    throw new BreakoutLabDomainError("INVALID_PARAMS", "开始日期格式无效，应为 YYYY-MM-DD", { status: 400 });
  }
  try {
    assertIsoDateString(params.endDate, "endDate");
  } catch {
    throw new BreakoutLabDomainError("INVALID_PARAMS", "结束日期格式无效，应为 YYYY-MM-DD", { status: 400 });
  }
  if (params.startDate > params.endDate) {
    throw new BreakoutLabDomainError("INVALID_PARAMS", "开始日期不能晚于结束日期", { status: 400 });
  }
  if (!(Number.isFinite(params.initialCapital) && params.initialCapital > 0)) {
    throw new BreakoutLabDomainError("INVALID_PARAMS", "初始资金必须大于 0", { status: 400 });
  }
  if (params.riskPct != null && !(Number.isFinite(params.riskPct) && params.riskPct > 0)) {
    throw new BreakoutLabDomainError("INVALID_PARAMS", "每笔风险必须大于 0", { status: 400 });
  }
  if (params.maxSlots != null && !(Number.isFinite(params.maxSlots) && params.maxSlots >= 1)) {
    throw new BreakoutLabDomainError("INVALID_PARAMS", "最多同时持仓必须至少为 1", { status: 400 });
  }
}

type ResolvedAsset = { assetKey: string; market: string; symbol: string; currency: string; yfinanceSymbol: string };

type BreakoutPosition = {
  symbol: string;
  trade: BreakoutTrade;
  shares: number;
};

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

function normalizePriceBars(series: PriceBar[]): PriceBar[] {
  const byDate = new Map<string, PriceBar>();
  for (const bar of series || []) {
    const date = String(bar?.date || "").trim();
    const close = Number(bar?.close);
    if (!date || !(Number.isFinite(close) && close > 0)) continue;
    byDate.set(date, { date, close });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function fxYahooSymbol(baseCurrency: string, quoteCurrency: string): string {
  return `${normalizeMoneyCurrency(baseCurrency)}${normalizeMoneyCurrency(quoteCurrency)}=X`;
}

function latestCloseOnOrBefore(series: PriceBar[], date: string): number | null {
  let latest: number | null = null;
  for (const bar of series) {
    if (bar.date > date) break;
    latest = bar.close;
  }
  return latest && latest > 0 ? latest : null;
}

async function fetchFxRateHistoryToBase(
  localCurrencyRaw: string,
  baseCurrencyRaw: string,
  startDate: string,
  warnings: string[],
): Promise<PriceBar[]> {
  const localCurrency = normalizeMoneyCurrency(localCurrencyRaw, "USD");
  const baseCurrency = normalizeMoneyCurrency(baseCurrencyRaw, "USD");
  if (localCurrency === baseCurrency) return [];

  const baseToLocalSymbol = fxYahooSymbol(baseCurrency, localCurrency);
  try {
    const result = await fetchPriceSeriesWithCache(baseToLocalSymbol, startDate, {
      market: "FX",
      currency: localCurrency,
      minDbDays: 2,
      timeoutMs: 8000,
    });
    const bars = normalizePriceBars(
      (result.data || []).map((point) => ({
        date: point.date,
        close: Number(point.close) > 0 ? 1 / Number(point.close) : Number.NaN,
      })),
    );
    if (bars.length >= 2) return bars;
  } catch (err) {
    logSwallowed(`breakoutLab.fetchFxRateHistory(${baseToLocalSymbol})`, err);
  }

  const localToBaseSymbol = fxYahooSymbol(localCurrency, baseCurrency);
  try {
    const result = await fetchPriceSeriesWithCache(localToBaseSymbol, startDate, {
      market: "FX",
      currency: baseCurrency,
      minDbDays: 2,
      timeoutMs: 8000,
    });
    const bars = normalizePriceBars(
      (result.data || []).map((point) => ({
        date: point.date,
        close: Number(point.close),
      })),
    );
    if (bars.length >= 2) return bars;
  } catch (err) {
    logSwallowed(`breakoutLab.fetchFxRateHistory(${localToBaseSymbol})`, err);
  }

  warnings.push(`缺少 ${localCurrency}/${baseCurrency} 历史 FX 序列，涉及该币种的 breakout 组合估值将被跳过`);
  return [];
}

async function fetchFxHistoriesForAssets(
  assets: ResolvedAsset[],
  baseCurrency: string,
  startDate: string,
  warnings: string[],
): Promise<Record<string, PriceBar[]>> {
  const currencies = [...new Set(assets.map((asset) => normalizeMoneyCurrency(asset.currency)).filter((currency) => currency !== baseCurrency))];
  const entries = await Promise.all(
    currencies.map(async (currency) => [currency, await fetchFxRateHistoryToBase(currency, baseCurrency, startDate, warnings)] as const),
  );
  return Object.fromEntries(entries.filter(([, series]) => series.length >= 2));
}

function convertPriceToBase(input: {
  symbol: string;
  date: string;
  price: number;
  assetCurrencyBySymbol: Record<string, string>;
  baseCurrency: string;
  fxSeriesByCurrency: Record<string, PriceBar[]>;
}): number | null {
  const price = Number(input.price);
  if (!(Number.isFinite(price) && price > 0)) return null;
  const currency = normalizeMoneyCurrency(input.assetCurrencyBySymbol[input.symbol], input.baseCurrency);
  if (currency === input.baseCurrency) return price;
  const fx = latestCloseOnOrBefore(input.fxSeriesByCurrency[currency] || [], input.date);
  if (!(fx && fx > 0)) return null;
  return price * fx;
}

function buildPortfolioCalendar(input: {
  startDate: string;
  endDate: string;
  priceSeriesBySymbol: Record<string, PriceBar[]>;
  fxSeriesByCurrency: Record<string, PriceBar[]>;
}): string[] {
  const set = new Set<string>();
  for (const series of Object.values(input.priceSeriesBySymbol)) {
    for (const bar of series) {
      if (bar.date >= input.startDate && bar.date <= input.endDate) set.add(bar.date);
    }
  }
  for (const series of Object.values(input.fxSeriesByCurrency)) {
    for (const bar of series) {
      if (bar.date >= input.startDate && bar.date <= input.endDate) set.add(bar.date);
    }
  }
  set.add(input.startDate);
  set.add(input.endDate);
  return [...set].sort();
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
    if (result.source !== "db") {
      warnings.push(`资产 ${asset.assetKey} 的 breakout 行情使用 ${result.source} 数据源，建议复核样本稳定性`);
    }
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
    } else if (bars.length < DEFAULT_BREAKOUT_PARAMS.maSlow + 5) {
      warnings.push(`资产 ${asset.assetKey} 的有效 OHLCV 样本仅 ${bars.length} 根，可能不足以稳定评估 breakout 策略`);
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
  priceSeriesBySymbol: Record<string, PriceBar[]>,
  assetCurrencyBySymbol: Record<string, string>,
  baseCurrency: string,
  fxSeriesByCurrency: Record<string, PriceBar[]>,
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
  let skippedSlots = 0;
  let skippedCapital = 0;
  let cash = initial;
  const positions: BreakoutPosition[] = [];
  const equityCurve: BreakoutLabEquityPoint[] = [];

  const entryByDate = new Map<string, BreakoutTrade[]>();
  for (const trade of sorted) {
    const list = entryByDate.get(trade.entryDate) || [];
    list.push(trade);
    entryByDate.set(trade.entryDate, list);
  }

  const dates = buildPortfolioCalendar({
    startDate: params.startDate,
    endDate: params.endDate,
    priceSeriesBySymbol,
    fxSeriesByCurrency,
  });

  function markPositionValue(date: string, position: BreakoutPosition): number {
    const closeLocal = latestCloseOnOrBefore(priceSeriesBySymbol[position.symbol] || [], date);
    if (!(closeLocal && closeLocal > 0)) return 0;
    const closeBase = convertPriceToBase({
      symbol: position.symbol,
      date,
      price: closeLocal,
      assetCurrencyBySymbol,
      baseCurrency,
      fxSeriesByCurrency,
    });
    if (!(closeBase && closeBase > 0)) return 0;
    return position.shares * closeBase;
  }

  for (const date of dates) {
    const todayEntries = entryByDate.get(date) || [];
    for (const tr of todayEntries) {
      if (positions.length >= maxSlots) {
        skippedSlots += 1;
        continue;
      }
      const entryBase = convertPriceToBase({
        symbol: tr.symbol,
        date: tr.entryDate,
        price: tr.entry,
        assetCurrencyBySymbol,
        baseCurrency,
        fxSeriesByCurrency,
      });
      const stopBase = convertPriceToBase({
        symbol: tr.symbol,
        date: tr.entryDate,
        price: tr.stop,
        assetCurrencyBySymbol,
        baseCurrency,
        fxSeriesByCurrency,
      });
      if (!(entryBase && stopBase && entryBase > stopBase)) {
        skippedCapital += 1;
        continue;
      }
      const openValue = positions.reduce((sum, position) => sum + markPositionValue(date, position), 0);
      const liveEquity = cash + openValue;
      const riskPerShare = entryBase - stopBase;
      const riskBudget = Math.max(0, liveEquity * riskPct);
      let shares = riskBudget / riskPerShare;
      if (shares * entryBase > maxPos) shares = maxPos / entryBase;
      if (shares * entryBase > cash) shares = cash / entryBase;
      if (!(shares > 0)) {
        skippedCapital += 1;
        continue;
      }
      cash -= shares * entryBase;
      positions.push({ symbol: tr.symbol, trade: tr, shares });
      taken += 1;
    }

    const remaining: BreakoutPosition[] = [];
    for (const position of positions) {
      if (position.trade.exitDate !== date) {
        remaining.push(position);
        continue;
      }
      const exitBase = convertPriceToBase({
        symbol: position.symbol,
        date: position.trade.exitDate,
        price: position.trade.exit,
        assetCurrencyBySymbol,
        baseCurrency,
        fxSeriesByCurrency,
      });
      if (!(exitBase && exitBase > 0)) continue;
      cash += position.shares * exitBase;
    }
    positions.length = 0;
    positions.push(...remaining);

    equity = cash + positions.reduce((sum, position) => sum + markPositionValue(date, position), 0);
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
    equityCurve.push({ date, equity: round2(equity) });
  }

  return {
    baseCurrency,
    initialCapital: initial,
    finalEquity: round2(equity),
    totalReturnPct: round2((equity / initial - 1) * 100),
    maxDrawdownPct: round2(maxDd * 100),
    tradesTaken: taken,
    tradesSkippedSlotsFull: skippedSlots,
    tradesSkippedCapitalLimited: skippedCapital,
    equityCurve,
  };
}

function computeSelectedAssetsBuyHoldBenchmark(input: {
  assets: ResolvedAsset[];
  baseCurrency: string;
  priceSeriesBySymbol: Record<string, PriceBar[]>;
  fxSeriesByCurrency: Record<string, PriceBar[]>;
}): BreakoutLabRunResult["benchmark"] {
  if (!input.assets.length) return null;
  const assetCurrencyBySymbol = Object.fromEntries(
    input.assets.map((asset) => [asset.assetKey, normalizeMoneyCurrency(asset.currency, input.baseCurrency)]),
  );
  const dates = buildPortfolioCalendar({
    startDate: minDate(Object.values(input.priceSeriesBySymbol).flatMap((series) => series.map((bar) => bar.date))),
    endDate: maxDate(Object.values(input.priceSeriesBySymbol).flatMap((series) => series.map((bar) => bar.date))),
    priceSeriesBySymbol: input.priceSeriesBySymbol,
    fxSeriesByCurrency: input.fxSeriesByCurrency,
  });
  if (dates.length < 2) return null;

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const weights = 1 / input.assets.length;
  let startValue = 0;
  let endValue = 0;

  for (const asset of input.assets) {
    const series = input.priceSeriesBySymbol[asset.assetKey] || [];
    const firstClose = latestCloseOnOrBefore(series, firstDate);
    const lastClose = latestCloseOnOrBefore(series, lastDate);
    if (!(firstClose && lastClose)) return null;
    const firstBase = convertPriceToBase({
      symbol: asset.assetKey,
      date: firstDate,
      price: firstClose,
      assetCurrencyBySymbol,
      baseCurrency: input.baseCurrency,
      fxSeriesByCurrency: input.fxSeriesByCurrency,
    });
    const lastBase = convertPriceToBase({
      symbol: asset.assetKey,
      date: lastDate,
      price: lastClose,
      assetCurrencyBySymbol,
      baseCurrency: input.baseCurrency,
      fxSeriesByCurrency: input.fxSeriesByCurrency,
    });
    if (!(firstBase && lastBase && firstBase > 0)) return null;
    startValue += weights;
    endValue += weights * (lastBase / firstBase);
  }

  const label = input.assets.length === 1 ? input.assets[0].assetKey : "等权买入持有篮子";
  return {
    symbol: label,
    buyHoldReturnPct: round2((endValue / startValue - 1) * 100),
  };
}

export async function runBreakoutLabBacktest(params: BreakoutLabRunParams): Promise<BreakoutLabRunResult> {
  validateBreakoutParams(params);
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const warnings: string[] = [];

  const assets = (params.assets || []).map(resolveAsset).filter((a): a is ResolvedAsset => Boolean(a?.assetKey));
  if (!assets.length) {
    throw new BreakoutLabDomainError("NO_ASSETS", "至少需要一个资产", { status: 400 });
  }
  const inferredBaseCurrency = normalizeMoneyCurrency(params.baseCurrency || assets[0]?.currency || "USD", "USD");
  const assetCurrencies = [...new Set(assets.map((asset) => normalizeMoneyCurrency(asset.currency, inferredBaseCurrency)))];
  if (assetCurrencies.length > 1 && !params.baseCurrency) {
    warnings.push(`breakout 组合包含多币种资产，未显式指定基准货币，已默认使用首个资产币种 ${inferredBaseCurrency} 估值`);
  }
  const resolvedParams: BreakoutParams = { ...DEFAULT_BREAKOUT_PARAMS, ...(params.strategy || {}) };

  const allTrades: BreakoutTrade[] = [];
  const perSymbol: BreakoutLabPerSymbol[] = [];
  const priceSeriesBySymbol: Record<string, PriceBar[]> = {};

  // 逐只拉数据 + 回测（顺序执行，避免 Yahoo 限流）
  for (const asset of assets) {
    const bars = await fetchOhlcv(asset, params.startDate, params.endDate, warnings);
    priceSeriesBySymbol[asset.assetKey] = normalizePriceBars(
      bars.map((bar) => ({ date: bar.date, close: bar.close })),
    );
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
  const fxSeriesByCurrency = await fetchFxHistoriesForAssets(assets, inferredBaseCurrency, params.startDate, warnings);
  const assetCurrencyBySymbol = Object.fromEntries(
    assets.map((asset) => [asset.assetKey, normalizeMoneyCurrency(asset.currency, inferredBaseCurrency)]),
  );
  const portfolio = simulatePortfolio(
    allTrades,
    priceSeriesBySymbol,
    assetCurrencyBySymbol,
    inferredBaseCurrency,
    fxSeriesByCurrency,
    params,
  );

  const benchmark = computeSelectedAssetsBuyHoldBenchmark({
    assets,
    baseCurrency: inferredBaseCurrency,
    priceSeriesBySymbol,
    fxSeriesByCurrency,
  });

  const result: BreakoutLabRunResult = {
    runId,
    createdAt,
    mode: "breakout",
    baseCurrency: inferredBaseCurrency,
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
          inferredBaseCurrency,
          params.startDate,
          params.endDate,
          JSON.stringify({ mode: "breakout", ...params, baseCurrency: inferredBaseCurrency, resolvedParams }),
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

function minDate(values: string[]): string {
  return values.filter(Boolean).sort()[0] || "";
}

function maxDate(values: string[]): string {
  return values.filter(Boolean).sort().at(-1) || "";
}
