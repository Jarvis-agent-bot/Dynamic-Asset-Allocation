import { randomUUID } from "node:crypto";

import type { PriceBar } from "@/src/core/domain";
import {
  backtestDriftRebalance,
  type DriftRebalanceBacktestRequest,
} from "@/src/core/backtestDriftRebalance";
import { computeBacktestAttribution } from "@/src/core/backtest/attribution";
import {
  buildEqualWeightTargetWeights,
  buildMomentumTargetWeights,
  buildRiskParityTargetWeights,
  buildMinVarianceTargetWeights,
} from "@/src/core/ensemble/strategy";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { normalizeMoneyCurrency } from "@/src/daa/modules/money/money";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { buildDaaAssetKey, parseDaaAssetKey } from "@/src/daa/assetKey";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

import type {
  StrategyLabRunParams,
  StrategyLabRunResult,
  StrategyLabHistoryItem,
  StrategyLabEquityPoint,
  StrategyLabStrategyResult,
} from "./strategyLabTypes";

type StrategyLabDomainErrorCode =
  | "NO_ASSETS"
  | "NO_PRICE_HISTORY"
  | "INSUFFICIENT_ALIGNED_HISTORY";

export class StrategyLabDomainError extends Error {
  readonly code: StrategyLabDomainErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: StrategyLabDomainErrorCode,
    message: string,
    options: { status?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "StrategyLabDomainError";
    this.code = code;
    this.status = options.status ?? 422;
    this.details = options.details ?? {};
  }
}

type ResolvedBacktestAsset = {
  assetKey: string;
  market: string;
  symbol: string;
  currency: string;
  yfinanceSymbol: string;
};

const SUPPORTED_STRATEGIES = new Set(["equalWeight", "momentum", "riskParity", "minVariance", "baseline"]);
const ROLLING_LOOKBACK_BARS = 63;

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

function inferInstrumentCurrency(marketRaw: string): string {
  const market = String(marketRaw || "").trim().toUpperCase();
  if (market === "HK") return "HKD";
  if (market === "CN") return "CNY";
  if (market === "KR") return "KRW";
  if (market === "TW") return "TWD";
  if (market === "JP") return "JPY";
  if (market === "SG") return "SGD";
  if (market === "UK") return "GBP";
  if (market === "EU") return "EUR";
  return "USD";
}

/** 将 asset key (MARKET::SYMBOL 或纯 symbol) 解析为当前系统的稳定资产键。 */
function resolveAsset(raw: string): ResolvedBacktestAsset | null {
  const parsed = parseDaaAssetKey(raw);
  const market = parsed?.market || "US";
  const symbol = parsed?.symbol || String(raw || "").trim().toUpperCase();
  if (!symbol) return null;
  const assetKey = buildDaaAssetKey(symbol, market);
  if (!assetKey) return null;
  return {
    assetKey,
    market,
    symbol,
    currency: inferInstrumentCurrency(market),
    yfinanceSymbol: toYfinanceSymbolByMarket(symbol, market),
  };
}

function normalizeStrategies(input: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of input || []) {
    const strategy = String(raw || "").trim();
    if (!SUPPORTED_STRATEGIES.has(strategy)) continue;
    if (!out.includes(strategy)) out.push(strategy);
  }
  return out.length > 0 ? out : ["equalWeight"];
}

function appendUnique(target: string[], more: string[]) {
  for (const item of more) {
    if (!item) continue;
    if (!target.includes(item)) target.push(item);
  }
}

function maxIsoDate(values: string[]): string {
  return values.filter(Boolean).sort().at(-1) || "";
}

function minIsoDate(values: string[]): string {
  return values.filter(Boolean).sort()[0] || "";
}

function fxYahooSymbol(baseCurrency: string, quoteCurrency: string): string {
  return `${normalizeMoneyCurrency(baseCurrency)}${normalizeMoneyCurrency(quoteCurrency)}=X`;
}

/** 根据策略名称和价格序列计算目标权重 */
function computeTargetWeights(
  strategy: string,
  symbols: string[],
  seriesBySymbol: Record<string, PriceBar[]>,
): { weights: Record<string, number>; warnings: string[] } {
  switch (strategy) {
    case "equalWeight":
    case "baseline":
      return { weights: buildEqualWeightTargetWeights(symbols), warnings: [] };

    case "momentum": {
      const returns: Record<string, number> = {};
      for (const sym of symbols) {
        const bars = seriesBySymbol[sym] || [];
        if (bars.length < 2) continue;
        const first = bars[0].close;
        const last = bars[bars.length - 1].close;
        if (first > 0 && last > 0) {
          returns[sym] = last / first - 1;
        }
      }
      const weights = buildMomentumTargetWeights(returns);
      if (Object.keys(weights).length === 0) {
        return {
          weights: buildEqualWeightTargetWeights(symbols),
          warnings: ["策略 momentum 在当前窗口没有正动量资产，已回退为等权配置"],
        };
      }
      return { weights, warnings: [] };
    }

    case "riskParity": {
      const volBySymbol: Record<string, number> = {};
      for (const sym of symbols) {
        const bars = seriesBySymbol[sym] || [];
        if (bars.length < 20) continue;
        const rets: number[] = [];
        for (let i = 1; i < bars.length; i++) {
          const prev = bars[i - 1].close;
          const curr = bars[i].close;
          if (prev > 0 && curr > 0) rets.push(curr / prev - 1);
        }
        if (rets.length < 10) continue;
        const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
        const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
        const vol = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
        if (vol > 0) volBySymbol[sym] = vol;
      }
      const weights = buildRiskParityTargetWeights(volBySymbol);
      if (Object.keys(weights).length === 0) {
        return {
          weights: buildEqualWeightTargetWeights(symbols),
          warnings: ["策略 riskParity 在当前窗口波动率样本不足，已回退为等权配置"],
        };
      }
      return { weights, warnings: [] };
    }

    case "minVariance": {
      const bars: Record<string, number[]> = {};
      for (const sym of symbols) {
        const series = seriesBySymbol[sym] || [];
        const rets: number[] = [];
        for (let i = 1; i < series.length; i++) {
          const prev = series[i - 1].close;
          const curr = series[i].close;
          if (prev > 0 && curr > 0) rets.push(curr / prev - 1);
        }
        if (rets.length >= 10) bars[sym] = rets;
      }
      const symsWithData = Object.keys(bars);
      if (symsWithData.length < 2) {
        return {
          weights: buildEqualWeightTargetWeights(symbols),
          warnings: ["策略 minVariance 在当前窗口可用资产不足 2 个，已回退为等权配置"],
        };
      }
      // 计算协方差矩阵
      const minLen = Math.min(...symsWithData.map((s) => bars[s].length));
      const covMatrix: Record<string, Record<string, number>> = {};
      for (const a of symsWithData) {
        covMatrix[a] = {};
        for (const b of symsWithData) {
          const rA = bars[a].slice(0, minLen);
          const rB = bars[b].slice(0, minLen);
          const meanA = rA.reduce((s, x) => s + x, 0) / rA.length;
          const meanB = rB.reduce((s, x) => s + x, 0) / rB.length;
          let cov = 0;
          for (let i = 0; i < minLen; i++) {
            cov += (rA[i] - meanA) * (rB[i] - meanB);
          }
          covMatrix[a][b] = cov / (minLen - 1);
        }
      }
      const weights = buildMinVarianceTargetWeights(covMatrix);
      if (Object.keys(weights).length === 0) {
        return {
          weights: buildEqualWeightTargetWeights(symbols),
          warnings: ["策略 minVariance 在当前窗口协方差矩阵不可用，已回退为等权配置"],
        };
      }
      return { weights, warnings: [] };
    }

    default:
      return {
        weights: buildEqualWeightTargetWeights(symbols),
        warnings: [`未知策略 ${strategy}，已回退为等权配置`],
      };
  }
}

// ---------------------------------------------------------------------------
// 获取价格历史
// ---------------------------------------------------------------------------

async function fetchPriceHistory(
  assets: ResolvedBacktestAsset[],
  startDate: string,
  endDate: string,
): Promise<{ seriesBySymbol: Record<string, PriceBar[]>; warnings: string[] }> {
  const seriesBySymbol: Record<string, PriceBar[]> = {};
  const warnings: string[] = [];

  await Promise.all(
    assets.map(async (asset) => {
      if (!asset.yfinanceSymbol) {
        warnings.push(`无法映射 yfinance symbol: ${asset.assetKey}`);
        return;
      }
      try {
        const result = await fetchPriceSeriesWithCache(asset.yfinanceSymbol, startDate, {
          market: asset.market,
          currency: asset.currency,
          minDbDays: 2,
          timeoutMs: 8000,
        });
        const bars = result.data
          .filter((point) => point.date >= startDate && point.date <= endDate)
          .map((point) => ({ date: point.date, close: point.close }));
        if (bars.length < 2) {
          warnings.push(`资产 ${asset.assetKey} 在 ${startDate} ~ ${endDate} 的价格数据不足`);
          return;
        }
        if (result.error) {
          warnings.push(`资产 ${asset.assetKey} 行情源降级: ${result.error}`);
        }
        seriesBySymbol[asset.assetKey] = bars;
      } catch (err) {
        logSwallowed(`strategyLab.fetchPriceHistory(${asset.yfinanceSymbol})`, err);
        warnings.push(`获取 ${asset.assetKey} 价格历史失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  return { seriesBySymbol, warnings };
}

function normalizeFxRateSeries(
  points: Array<{ date: string; close: number }>,
  endDate: string,
  convertClose: (close: number) => number,
): PriceBar[] {
  const bars = normalizePriceBars(
    (points || []).map((point) => ({
      date: point.date,
      close: convertClose(Number(point.close)),
    })),
  );
  if (bars.length === 1 && bars[0].date < endDate) {
    bars.push({ date: endDate, close: bars[0].close });
  }
  return bars;
}

async function fetchFxRateHistoryToBase(
  localCurrencyRaw: string,
  baseCurrencyRaw: string,
  startDate: string,
  endDate: string,
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
    const bars = normalizeFxRateSeries(
      result.data.filter((point) => point.date >= startDate && point.date <= endDate),
      endDate,
      (close) => (close > 0 ? 1 / close : Number.NaN),
    );
    if (bars.length >= 2) {
      if (result.error) warnings.push(`FX ${localCurrency}/${baseCurrency} 行情源降级: ${result.error}`);
      return bars;
    }
  } catch (err) {
    logSwallowed(`strategyLab.fetchFxRateHistory(${baseToLocalSymbol})`, err);
  }

  const localToBaseSymbol = fxYahooSymbol(localCurrency, baseCurrency);
  try {
    const result = await fetchPriceSeriesWithCache(localToBaseSymbol, startDate, {
      market: "FX",
      currency: baseCurrency,
      minDbDays: 2,
      timeoutMs: 8000,
    });
    const bars = normalizeFxRateSeries(
      result.data.filter((point) => point.date >= startDate && point.date <= endDate),
      endDate,
      (close) => close,
    );
    if (bars.length >= 2) {
      if (result.error) warnings.push(`FX ${localCurrency}/${baseCurrency} 行情源降级: ${result.error}`);
      return bars;
    }
  } catch (err) {
    logSwallowed(`strategyLab.fetchFxRateHistory(${localToBaseSymbol})`, err);
  }

  warnings.push(`缺少 ${localCurrency}/${baseCurrency} 历史 FX 序列，相关资产无法纳入基准货币回测`);
  return [];
}

async function fetchFxHistoriesForAssets(
  assets: ResolvedBacktestAsset[],
  baseCurrency: string,
  startDate: string,
  endDate: string,
  warnings: string[],
): Promise<Record<string, PriceBar[]>> {
  const currencies = [...new Set(assets.map((asset) => normalizeMoneyCurrency(asset.currency)).filter((currency) => currency !== baseCurrency))];
  const entries = await Promise.all(
    currencies.map(async (currency) => [
      currency,
      await fetchFxRateHistoryToBase(currency, baseCurrency, startDate, endDate, warnings),
    ] as const),
  );
  return Object.fromEntries(entries.filter(([, series]) => series.length >= 2));
}

async function fetchBenchmarkHistory(
  benchmarkSymbol: string,
  startDate: string,
  endDate: string,
  baseCurrency: string,
  fxSeriesByCurrency: Record<string, PriceBar[]>,
  warnings: string[],
): Promise<Array<{ date: string; close: number }>> {
  const resolved = resolveAsset(benchmarkSymbol || "SPY");
  if (!resolved?.yfinanceSymbol) {
    warnings.push(`无法映射基准 yfinance symbol: ${benchmarkSymbol || "SPY"}`);
    return [];
  }
  try {
    const result = await fetchPriceSeriesWithCache(resolved.yfinanceSymbol, startDate, {
      market: resolved.market,
      currency: resolved.currency,
      minDbDays: 2,
      timeoutMs: 8000,
    });
    if (result.error && result.data.length === 0) {
      warnings.push(`获取基准 ${benchmarkSymbol || "SPY"} 失败: ${result.error}`);
      return [];
    }
    const localSeries = result.data
      .filter((point) => point.date >= startDate && point.date <= endDate)
      .map((point) => ({ date: point.date, close: point.close }));
    const currency = normalizeMoneyCurrency(resolved.currency, baseCurrency);
    if (currency === baseCurrency) return localSeries;

    const fxSeries = fxSeriesByCurrency[currency]?.length
      ? fxSeriesByCurrency[currency]
      : await fetchFxRateHistoryToBase(currency, baseCurrency, startDate, endDate, warnings);
    const converted = buildCalendarFrame({
      seriesBySymbol: { [resolved.assetKey]: localSeries },
      assetCurrenciesBySymbol: { [resolved.assetKey]: currency },
      baseCurrency,
      fxSeriesByCurrency: { [currency]: fxSeries },
    }).seriesBySymbol[resolved.assetKey];
    if (!converted?.length) {
      warnings.push(`基准 ${benchmarkSymbol || "SPY"} 缺少 ${currency}/${baseCurrency} FX 序列，已跳过基准比较`);
      return [];
    }
    return converted.map((bar) => ({ date: bar.date, close: bar.close }));
  } catch (err) {
    logSwallowed(`strategyLab.fetchBenchmarkHistory(${resolved.yfinanceSymbol})`, err);
    warnings.push(`获取基准 ${benchmarkSymbol || "SPY"} 失败: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 构造估值日历
// ---------------------------------------------------------------------------

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

function buildCalendarFrame(input: {
  seriesBySymbol: Record<string, PriceBar[]>;
  assetCurrenciesBySymbol: Record<string, string>;
  baseCurrency: string;
  fxSeriesByCurrency: Record<string, PriceBar[]>;
}): {
  seriesBySymbol: Record<string, PriceBar[]>;
  executableDatesBySymbol: Record<string, string[]>;
  dates: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const normalizedBySymbol = Object.fromEntries(
    Object.entries(input.seriesBySymbol)
      .map(([symbol, series]) => [symbol, normalizePriceBars(series)] as const)
      .filter(([, series]) => series.length >= 2),
  ) as Record<string, PriceBar[]>;
  const baseCurrency = normalizeMoneyCurrency(input.baseCurrency, "USD");

  const frames = Object.fromEntries(
    Object.entries(normalizedBySymbol)
      .map(([symbol, localBars]) => {
        const currency = normalizeMoneyCurrency(input.assetCurrenciesBySymbol[symbol], baseCurrency);
        const fxBars = currency === baseCurrency
          ? []
          : normalizePriceBars(input.fxSeriesByCurrency[currency] || []);
        if (currency !== baseCurrency && fxBars.length < 2) {
          warnings.push(`资产 ${symbol} 缺少 ${currency}/${baseCurrency} 历史 FX 序列，已排除`);
          return null;
        }

        const firstReadyDate = currency === baseCurrency
          ? localBars[0].date
          : maxIsoDate([localBars[0].date, fxBars[0].date]);
        const lastReadyDate = currency === baseCurrency
          ? localBars[localBars.length - 1].date
          : minIsoDate([localBars[localBars.length - 1].date, fxBars[fxBars.length - 1].date]);

        if (!firstReadyDate || !lastReadyDate || firstReadyDate > lastReadyDate) {
          warnings.push(`资产 ${symbol} 的价格与 FX 历史没有可重叠的估值区间，已排除`);
          return null;
        }

        return [symbol, { currency, localBars, fxBars, firstReadyDate, lastReadyDate }] as const;
      })
      .filter((item): item is readonly [string, {
        currency: string;
        localBars: PriceBar[];
        fxBars: PriceBar[];
        firstReadyDate: string;
        lastReadyDate: string;
      }] => Boolean(item)),
  );

  const symbols = Object.keys(frames);
  if (!symbols.length) {
    return { seriesBySymbol: {}, executableDatesBySymbol: {}, dates: [], warnings };
  }

  const overlapStart = maxIsoDate(symbols.map((symbol) => frames[symbol].firstReadyDate));
  const overlapEnd = minIsoDate(symbols.map((symbol) => frames[symbol].lastReadyDate));
  if (!overlapStart || !overlapEnd || overlapStart > overlapEnd) {
    return {
      seriesBySymbol: {},
      executableDatesBySymbol: {},
      dates: [],
      warnings: ["所选资产价格历史没有可重叠的估值区间"],
    };
  }

  const dateSet = new Set<string>();
  for (const frame of Object.values(frames)) {
    for (const bar of frame.localBars) {
      if (bar.date >= overlapStart && bar.date <= overlapEnd) dateSet.add(bar.date);
    }
    for (const bar of frame.fxBars) {
      if (bar.date >= overlapStart && bar.date <= overlapEnd) dateSet.add(bar.date);
    }
  }
  const dates = [...dateSet].sort();
  const aligned: Record<string, PriceBar[]> = {};
  const executableDatesBySymbol: Record<string, string[]> = {};
  let syntheticLocalBars = 0;
  let syntheticFxBars = 0;
  const convertedCurrencies = new Set<string>();

  for (const symbol of symbols) {
    const frame = frames[symbol];
    const realLocalDates = new Set(frame.localBars.map((bar) => bar.date));
    const realFxDates = new Set(frame.fxBars.map((bar) => bar.date));
    executableDatesBySymbol[symbol] = frame.localBars
      .map((bar) => bar.date)
      .filter((date) => date >= overlapStart && date <= overlapEnd);

    const filled: PriceBar[] = [];
    let localCursor = 0;
    let fxCursor = 0;
    let lastLocalClose: number | null = null;
    let lastFxRate = frame.currency === baseCurrency ? 1 : null;

    for (const date of dates) {
      while (localCursor < frame.localBars.length && frame.localBars[localCursor].date <= date) {
        lastLocalClose = frame.localBars[localCursor].close;
        localCursor += 1;
      }
      while (frame.currency !== baseCurrency && fxCursor < frame.fxBars.length && frame.fxBars[fxCursor].date <= date) {
        lastFxRate = frame.fxBars[fxCursor].close;
        fxCursor += 1;
      }
      if (!(lastLocalClose && Number.isFinite(lastLocalClose) && lastLocalClose > 0)) {
        warnings.push(`资产 ${symbol} 在 ${date} 缺少可前向填充的价格，已无法纳入统一估值日历`);
        break;
      }
      if (!(lastFxRate && Number.isFinite(lastFxRate) && lastFxRate > 0)) {
        warnings.push(`资产 ${symbol} 在 ${date} 缺少可前向填充的 ${frame.currency}/${baseCurrency} FX，已无法纳入统一估值日历`);
        break;
      }
      if (!realLocalDates.has(date)) syntheticLocalBars += 1;
      if (frame.currency !== baseCurrency && !realFxDates.has(date)) syntheticFxBars += 1;
      filled.push({ date, close: lastLocalClose * lastFxRate });
    }

    if (filled.length === dates.length) {
      aligned[symbol] = filled;
      if (frame.currency !== baseCurrency) convertedCurrencies.add(`${frame.currency}/${baseCurrency}`);
    }
  }

  if ((symbols.length > 1 || convertedCurrencies.size > 0) && syntheticLocalBars > 0) {
    warnings.push(`跨市场估值日历已改为交易日并集；资产非交易日用上一根收盘价前向填充 ${syntheticLocalBars} 个估值点，下单仍限制在各资产真实交易日`);
  }
  if (convertedCurrencies.size > 0) {
    warnings.push(`已使用 ${[...convertedCurrencies].sort().join(", ")} 历史 FX 序列将非基准货币资产转换为 ${baseCurrency} 估值`);
    if (syntheticFxBars > 0) {
      warnings.push(`FX 非交易日用上一根汇率前向填充 ${syntheticFxBars} 个估值点`);
    }
  }

  return {
    seriesBySymbol: aligned,
    executableDatesBySymbol,
    dates,
    warnings,
  };
}

function rebalancePeriodKey(date: string, freq: string): string {
  const [yearRaw, monthRaw] = date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return date;

  switch (freq) {
    case "quarterly":
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case "semiannual":
      return `${year}-H${month <= 6 ? 1 : 2}`;
    case "annual":
      return `${year}`;
    case "monthly":
    default:
      return `${year}-${String(month).padStart(2, "0")}`;
  }
}

function buildScheduledRebalanceDates(dates: string[], freq: string): string[] {
  const scheduled: string[] = [];
  let previousPeriod = "";
  for (const date of dates) {
    const period = rebalancePeriodKey(date, freq);
    if (!scheduled.length || period !== previousPeriod) scheduled.push(date);
    previousPeriod = period;
  }
  return scheduled;
}

function sliceSeriesThroughIndex(
  seriesBySymbol: Record<string, PriceBar[]>,
  endIndex: number,
  lookbackBars = ROLLING_LOOKBACK_BARS,
): Record<string, PriceBar[]> {
  const startIndex = Math.max(0, endIndex - lookbackBars + 1);
  return Object.fromEntries(
    Object.entries(seriesBySymbol).map(([symbol, series]) => [
      symbol,
      (series || []).slice(startIndex, endIndex + 1),
    ]),
  );
}

function buildScheduledTargetWeightsTimeline(input: {
  strategy: string;
  symbols: string[];
  dates: string[];
  seriesBySymbol: Record<string, PriceBar[]>;
  rebalanceDates: string[];
}): {
  targetWeightsByDate: Record<string, Record<string, number>>;
  finalTargetWeights: Record<string, number>;
  warnings: string[];
} {
  const targetWeightsByDate: Record<string, Record<string, number>> = {};
  const warnings: string[] = [];
  const rebalanceDateSet = new Set(input.rebalanceDates);
  let currentWeights: Record<string, number> = {};

  for (let i = 0; i < input.dates.length; i += 1) {
    const date = input.dates[i];
    if (!Object.keys(currentWeights).length || rebalanceDateSet.has(date)) {
      const rollingSeries = sliceSeriesThroughIndex(input.seriesBySymbol, i);
      const computed = computeTargetWeights(input.strategy, input.symbols, rollingSeries);
      currentWeights = computed.weights;
      appendUnique(warnings, computed.warnings);
    }
    targetWeightsByDate[date] = currentWeights;
  }
  const finalTargetWeights = targetWeightsByDate[input.dates[input.dates.length - 1]] || buildEqualWeightTargetWeights(input.symbols);
  return { targetWeightsByDate, finalTargetWeights, warnings };
}

// ---------------------------------------------------------------------------
// 主入口：执行回测
// ---------------------------------------------------------------------------

export async function runStrategyLabBacktest(
  params: StrategyLabRunParams,
): Promise<StrategyLabRunResult> {
  const runId = randomUUID();
  const createdAt = new Date().toISOString();

  // 1. 解析资产
  const assets = (params.assets || []).map(resolveAsset).filter((asset): asset is ResolvedBacktestAsset => Boolean(asset?.assetKey));
  if (!assets.length) {
    throw new StrategyLabDomainError("NO_ASSETS", "至少需要一个资产", { status: 400 });
  }

  const symbols = assets.map((asset) => asset.assetKey);
  const strategies = normalizeStrategies(params.strategies);
  const baseCurrency = normalizeMoneyCurrency(params.baseCurrency, "USD");
  const normalizedParams: StrategyLabRunParams = {
    ...params,
    assets: symbols,
    strategies,
    baseCurrency,
  };

  // 2. 获取价格历史
  const { seriesBySymbol: rawSeries, warnings } = await fetchPriceHistory(
    assets,
    params.startDate,
    params.endDate,
  );
  const commonWarnings = [...warnings];

  // 过滤无数据的资产
  const availableSymbols = symbols.filter((s) => (rawSeries[s]?.length ?? 0) >= 2);
  if (!availableSymbols.length) {
    throw new StrategyLabDomainError("NO_PRICE_HISTORY", "所有资产价格历史获取失败，无法执行回测", {
      status: 422,
      details: { warnings: commonWarnings },
    });
  }
  const availableAssets = assets.filter((asset) => availableSymbols.includes(asset.assetKey));
  const assetCurrenciesBySymbol = Object.fromEntries(
    availableAssets.map((asset) => [asset.assetKey, normalizeMoneyCurrency(asset.currency, baseCurrency)]),
  );
  const fxSeriesByCurrency = await fetchFxHistoriesForAssets(
    availableAssets,
    baseCurrency,
    params.startDate,
    params.endDate,
    commonWarnings,
  );
  const benchmarkSeries = await fetchBenchmarkHistory(
    params.benchmarkSymbol || "SPY",
    params.startDate,
    params.endDate,
    baseCurrency,
    fxSeriesByCurrency,
    commonWarnings,
  );

  // 3. 构造统一估值日历：用交易日并集估值，用真实交易日限制下单。
  const filteredSeries: Record<string, PriceBar[]> = {};
  for (const sym of availableSymbols) {
    filteredSeries[sym] = rawSeries[sym];
  }
  const calendarFrame = buildCalendarFrame({
    seriesBySymbol: filteredSeries,
    assetCurrenciesBySymbol,
    baseCurrency,
    fxSeriesByCurrency,
  });
  appendUnique(commonWarnings, calendarFrame.warnings);
  const alignedSeries = calendarFrame.seriesBySymbol;
  const seriesBySymbol = Object.fromEntries(
    Object.entries(alignedSeries).filter(([, series]) => series.length >= 2),
  );
  const alignedSymbols = availableSymbols.filter((symbol) => (seriesBySymbol[symbol]?.length ?? 0) >= 2);
  const dates = calendarFrame.dates;
  if (!alignedSymbols.length || dates.length < 2) {
    throw new StrategyLabDomainError("INSUFFICIENT_ALIGNED_HISTORY", "所选资产没有足够的重叠估值日，无法执行组合回测", {
      status: 422,
      details: { availableSymbols, warnings: commonWarnings },
    });
  }
  const droppedSymbols = availableSymbols.filter((symbol) => !alignedSymbols.includes(symbol));
  if (droppedSymbols.length > 0) {
    commonWarnings.push(`以下资产与组合重叠估值日不足，已排除：${droppedSymbols.join(", ")}`);
  }

  const closeSeriesBySymbol = Object.fromEntries(
    Object.entries(seriesBySymbol).map(([sym, bars]) =>
      [sym, bars.map((bar) => ({ date: bar.date, close: bar.close }))],
    ),
  );

  // 4. 对每个策略分别滚动计算权重并回测，避免用未来全周期数据做 day-0 权重。
  const strategyResults: StrategyLabStrategyResult[] = [];
  const allWarnings = [...commonWarnings];
  const rebalanceDates = buildScheduledRebalanceDates(dates, params.rebalanceFrequency || "monthly");

  for (const strategy of strategies) {
    const { targetWeightsByDate, finalTargetWeights, warnings: strategyWarnings } = buildScheduledTargetWeightsTimeline({
      strategy,
      symbols: alignedSymbols,
      dates,
      seriesBySymbol,
      rebalanceDates,
    });
    appendUnique(allWarnings, strategyWarnings);

    const backtestReq: DriftRebalanceBacktestRequest = {
      seriesBySymbol,
      targetWeightsByDate,
      rebalanceDates,
      executableDatesBySymbol: calendarFrame.executableDatesBySymbol,
      initialEquity: params.initialCapital || 10000,
      constraints: {
        minNotional: 0,
      },
      trigger: {
        driftThresholdPct: 0,
        minOrderNotional: 50,
        minRebalanceIntervalSeconds: 0,
      },
      execution: {
        timing: "t_plus_1_close",
        feeRateBps: params.feeRateBps ?? 10,
        slippageBps: params.slippageBps ?? 5,
      },
      bootstrapToTarget: true,
      includeEventStates: true,
      includeTimeline: false,
    };

    const backtestResult = backtestDriftRebalance(backtestReq);
    appendUnique(allWarnings, backtestResult.warnings);
    const resultWarnings: string[] = [];
    appendUnique(resultWarnings, strategyWarnings);
    appendUnique(resultWarnings, backtestResult.warnings);

    const attribution = computeBacktestAttribution({
      backtest: backtestResult,
      seriesBySymbol: closeSeriesBySymbol,
      benchmarkSymbol: params.benchmarkSymbol || "SPY",
      benchmarkSeries,
    });

    const equityCurve: StrategyLabEquityPoint[] = backtestResult.dates.map((date, i) => ({
      date,
      equity: backtestResult.equity[i],
    }));

    strategyResults.push({
      strategy,
      equityCurve,
      metrics: backtestResult.metrics,
      attribution,
      targetWeights: finalTargetWeights,
      warnings: resultWarnings,
    });
  }

  const primary = strategyResults[0];
  if (!primary) {
    throw new StrategyLabDomainError("NO_PRICE_HISTORY", "没有可用的策略回测结果", { status: 422 });
  }

  // 5. 持久化到数据库
  try {
    await withDaaPgClient(async ({ query }) => {
      await query(
        `INSERT INTO daa_strategy_lab_run_snapshots
           (run_id, created_at, base_currency, start_date, end_date, request_json, summary_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          runId,
          createdAt,
          baseCurrency,
          params.startDate,
          params.endDate,
          JSON.stringify(normalizedParams),
          JSON.stringify({
            metrics: primary.metrics,
            primaryStrategy: primary.strategy,
            strategyResults: strategyResults.map((item) => ({
              strategy: item.strategy,
              metrics: item.metrics,
              targetWeights: item.targetWeights,
            })),
            symbolCount: alignedSymbols.length,
          }),
        ],
      );
    });
  } catch (err) {
    logSwallowed("strategyLab.saveSnapshot", err);
    allWarnings.push("回测结果保存失败，但计算结果仍然可用");
  }

  return {
    runId,
    createdAt,
    baseCurrency,
    params: normalizedParams,
    strategyResults,
    primaryStrategy: primary.strategy,
    equityCurve: primary.equityCurve,
    metrics: primary.metrics,
    attribution: primary.attribution,
    targetWeights: primary.targetWeights,
    warnings: allWarnings,
  };
}

// ---------------------------------------------------------------------------
// 查询历史
// ---------------------------------------------------------------------------

export async function listStrategyLabHistory(
  limit = 20,
): Promise<StrategyLabHistoryItem[]> {
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT run_id, created_at, base_currency, start_date, end_date, request_json, summary_json
       FROM daa_strategy_lab_run_snapshots
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(100, Math.trunc(limit)))],
    );

    return (result.rows || []).map((row: Record<string, unknown>) => {
      const requestJson = typeof row.request_json === "string"
        ? JSON.parse(row.request_json)
        : (row.request_json || {});
      const summaryJson = typeof row.summary_json === "string"
        ? JSON.parse(row.summary_json)
        : (row.summary_json || {});

      return {
        runId: String(row.run_id || ""),
        createdAt: String(row.created_at || ""),
        baseCurrency: String(row.base_currency || "USD"),
        startDate: String(row.start_date || ""),
        endDate: String(row.end_date || ""),
        params: requestJson as StrategyLabRunParams,
        metrics: (summaryJson as Record<string, unknown>).metrics as StrategyLabHistoryItem["metrics"],
      };
    });
  });
}
