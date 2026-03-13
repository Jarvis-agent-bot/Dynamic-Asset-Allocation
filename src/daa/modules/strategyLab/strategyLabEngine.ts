import {
  backtestDriftRebalance,
  type DriftRebalanceBacktestRequest,
  type DriftRebalanceBacktestResult,
} from "@/src/core/backtestDriftRebalance";
import type { PriceBar } from "@/src/core/domain";
import {
  buildEqualWeightTargetWeights,
  buildMinVarianceTargetWeights,
  buildMomentumTargetWeights,
  buildRiskParityTargetWeights,
} from "@/src/core/ensemble/strategy";
import type {
  StrategyLabCandidateId,
  StrategyLabCandidateResult,
  StrategyLabEnsembleConfig,
  StrategyLabRunResult,
  StrategyLabSingleStrategyId,
  StrategyLabWeightDiffRow,
} from "./strategyLabTypes";

const SINGLE_STRATEGY_ORDER_: StrategyLabSingleStrategyId[] = ["momentum", "riskParity", "minVariance", "equalWeight"];

export const STRATEGY_LAB_CANDIDATE_ORDER_: StrategyLabCandidateId[] = [
  "baseline",
  ...SINGLE_STRATEGY_ORDER_,
  "ensemble",
];

const STRATEGY_LABELS_: Record<StrategyLabCandidateId, string> = {
  baseline: "当前配置",
  momentum: "趋势进攻",
  riskParity: "风险平衡",
  minVariance: "长仓最小方差",
  equalWeight: "均衡基线",
  ensemble: "组合候选",
};

type StrategyLabCandidateWindowBuildResult = {
  weightsByCandidate: Record<StrategyLabCandidateId, Record<string, number>>;
  warningsByCandidate: Record<StrategyLabCandidateId, string[]>;
};

type StrategyLabObservedDatesBySymbol = Record<string, string[]>;

type PreparedAlignedSeriesResult = {
  seriesBySymbol: Record<string, PriceBar[]>;
  diagnostics: PreparedSeriesDiagnostics;
  observedDatesBySymbol: StrategyLabObservedDatesBySymbol;
};

function toPositiveFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function cleanWeights(input: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  for (const [symbolRaw, valueRaw] of Object.entries(input || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const value = toPositiveFiniteNumber(valueRaw, 0);
    if (!symbol || value <= 0) continue;
    cleaned[symbol] = value;
  }
  return cleaned;
}

function normalizeWeights(input: Record<string, number>): Record<string, number> {
  const cleaned = cleanWeights(input);
  const sum = Object.values(cleaned).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return {};

  for (const symbol of Object.keys(cleaned)) {
    cleaned[symbol] = cleaned[symbol] / sum;
  }

  return cleaned;
}

function normalizeWeightsPreservingCash(input: Record<string, number>): Record<string, number> {
  const cleaned = cleanWeights(input);
  const sum = Object.values(cleaned).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return {};
  if (sum <= 1.000001) return cleaned;

  for (const symbol of Object.keys(cleaned)) {
    cleaned[symbol] = cleaned[symbol] / sum;
  }

  return cleaned;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, item) => sum + (item - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(variance, 0));
}

function covariance(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  const leftAvg = mean(left);
  const rightAvg = mean(right);
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    sum += (left[i] - leftAvg) * (right[i] - rightAvg);
  }
  return sum / left.length;
}

function buildObservedDateSet(input: {
  symbol: string;
  series: PriceBar[];
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbol;
}): Set<string> {
  const fromInput = input.observedDatesBySymbol?.[input.symbol];
  if (Array.isArray(fromInput) && fromInput.length > 0) {
    return new Set(fromInput.map((date) => String(date || "").trim()).filter(Boolean));
  }
  return new Set((input.series || []).map((bar) => String(bar.date || "").trim()).filter(Boolean));
}

function buildObservedBars(input: {
  symbol: string;
  series: PriceBar[];
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbol;
}): PriceBar[] {
  const observedDateSet = buildObservedDateSet(input);
  return (input.series || []).filter((bar) => {
    const date = String(bar.date || "").trim();
    const close = Number(bar.close);
    return observedDateSet.has(date) && Number.isFinite(close) && close > 0;
  });
}

function buildObservedReturnsByEndDate(series: PriceBar[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 1; i < series.length; i += 1) {
    const prev = Number(series[i - 1]?.close);
    const next = Number(series[i]?.close);
    const date = String(series[i]?.date || "").trim();
    if (!date || !(Number.isFinite(prev) && Number.isFinite(next) && prev > 0 && next > 0)) continue;
    out[date] = next / prev - 1;
  }
  return out;
}

function computeSeriesStats(input: {
  seriesBySymbol: Record<string, PriceBar[]>;
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbol;
}): {
  periodReturnsBySymbol: Record<string, number>;
  volBySymbol: Record<string, number>;
  covMatrixBySymbol: Record<string, Record<string, number>>;
} {
  const symbols = Object.keys(input.seriesBySymbol || {}).sort();
  const periodReturnsBySymbol: Record<string, number> = {};
  const volBySymbol: Record<string, number> = {};
  const returnsByEndDateBySymbol: Record<string, Record<string, number>> = {};

  for (const symbol of symbols) {
    const observedBars = buildObservedBars({
      symbol,
      series: input.seriesBySymbol[symbol] || [],
      observedDatesBySymbol: input.observedDatesBySymbol,
    });
    if (observedBars.length < 2) continue;

    const first = Number(observedBars[0]?.close);
    const last = Number(observedBars[observedBars.length - 1]?.close);
    if (!(Number.isFinite(first) && Number.isFinite(last) && first > 0 && last > 0)) continue;

    periodReturnsBySymbol[symbol] = last / first - 1;

    const returnsByEndDate = buildObservedReturnsByEndDate(observedBars);
    returnsByEndDateBySymbol[symbol] = returnsByEndDate;
    const returnValues = Object.values(returnsByEndDate).filter((value) => Number.isFinite(value));
    if (returnValues.length >= 2) {
      const volatility = stdDev(returnValues);
      if (Number.isFinite(volatility) && volatility > 0) {
        volBySymbol[symbol] = volatility;
      }
    }
  }

  const covMatrixBySymbol: Record<string, Record<string, number>> = {};
  const activeSymbols = Object.keys(returnsByEndDateBySymbol).sort();
  for (const left of activeSymbols) {
    const row: Record<string, number> = {};
    const leftReturns = returnsByEndDateBySymbol[left] || {};
    for (const right of activeSymbols) {
      const rightReturns = returnsByEndDateBySymbol[right] || {};
      const commonDates = Object.keys(leftReturns)
        .filter((date) => Object.prototype.hasOwnProperty.call(rightReturns, date))
        .sort();
      if (commonDates.length < 2) continue;

      const leftValues = commonDates.map((date) => Number(leftReturns[date]));
      const rightValues = commonDates.map((date) => Number(rightReturns[date]));
      const covValue = covariance(leftValues, rightValues);
      if (Number.isFinite(covValue)) {
        row[right] = covValue;
      }
    }
    if (Object.keys(row).length > 0) {
      covMatrixBySymbol[left] = row;
    }
  }

  return { periodReturnsBySymbol, volBySymbol, covMatrixBySymbol };
}

function clampEnsembleConfig(input: StrategyLabEnsembleConfig): StrategyLabEnsembleConfig {
  return {
    momentum: Math.max(0, Number(input.momentum) || 0),
    riskParity: Math.max(0, Number(input.riskParity) || 0),
    minVariance: Math.max(0, Number(input.minVariance) || 0),
    equalWeight: Math.max(0, Number(input.equalWeight) || 0),
  };
}

export function buildEnsembleWeights(
  strategyWeights: Record<StrategyLabSingleStrategyId, Record<string, number>>,
  ensembleConfig: StrategyLabEnsembleConfig,
): Record<string, number> {
  const config = clampEnsembleConfig(ensembleConfig);
  const out: Record<string, number> = {};

  for (const strategyId of SINGLE_STRATEGY_ORDER_) {
    const alpha = Number(config[strategyId]) || 0;
    if (alpha <= 0) continue;
    const bucket = strategyWeights[strategyId] || {};
    for (const [symbol, weightRaw] of Object.entries(bucket)) {
      const weight = toPositiveFiniteNumber(weightRaw, 0);
      if (weight <= 0) continue;
      out[symbol] = (out[symbol] || 0) + alpha * weight;
    }
  }

  return normalizeWeights(out);
}

function buildWeightsByCandidateForWindow(input: {
  symbols: string[];
  baselineTargetWeights: Record<string, number>;
  periodReturnsBySymbol: Record<string, number>;
  volBySymbol: Record<string, number>;
  covMatrixBySymbol: Record<string, Record<string, number>>;
  ensembleConfig: StrategyLabEnsembleConfig;
  decisionDate?: string;
}): StrategyLabCandidateWindowBuildResult {
  const equalWeight = buildEqualWeightTargetWeights(input.symbols);
  const baseline = normalizeWeightsPreservingCash(input.baselineTargetWeights);
  const warningsByCandidate: Record<StrategyLabCandidateId, string[]> = {
    baseline: [],
    momentum: [],
    riskParity: [],
    minVariance: [],
    equalWeight: [],
    ensemble: [],
  };

  const single: Record<StrategyLabSingleStrategyId, Record<string, number>> = {
    momentum: normalizeWeights(buildMomentumTargetWeights(input.periodReturnsBySymbol)),
    riskParity: normalizeWeights(buildRiskParityTargetWeights(input.volBySymbol)),
    minVariance: normalizeWeights(buildMinVarianceTargetWeights(input.covMatrixBySymbol)),
    equalWeight: normalizeWeights(equalWeight),
  };

  const warningDate = input.decisionDate || "unknown-date";
  const hasPositiveVol = Object.values(input.volBySymbol || {}).some((value) => Number.isFinite(value) && Number(value) > 0);
  if (!Object.keys(single.riskParity).length && !hasPositiveVol) {
    warningsByCandidate.riskParity.push(`riskParity: ${warningDate} volatility unavailable, emitted empty weights`);
  }
  const hasPositiveVariance = Object.entries(input.covMatrixBySymbol || {}).some(([symbolRaw, row]) => {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const variance = Number((row || {})[symbol]);
    return Boolean(symbol) && Number.isFinite(variance) && variance > 0;
  });
  if (!Object.keys(single.minVariance).length && !hasPositiveVariance) {
    warningsByCandidate.minVariance.push(`minVariance: ${warningDate} covariance unavailable, emitted empty weights`);
  }

  const activeStrategyWeights = {} as Record<StrategyLabSingleStrategyId, Record<string, number>>;
  const activeStrategyIds: StrategyLabSingleStrategyId[] = [];
  for (const strategyId of SINGLE_STRATEGY_ORDER_) {
    const alpha = Number(input.ensembleConfig[strategyId]) || 0;
    const weights = single[strategyId] || {};
    activeStrategyWeights[strategyId] = weights;
    if (alpha > 0 && Object.keys(weights).length > 0) activeStrategyIds.push(strategyId);
  }

  const ensemble = buildEnsembleWeights(activeStrategyWeights, input.ensembleConfig);
  const activeEnsembleAlphaIds = SINGLE_STRATEGY_ORDER_.filter((strategyId) => (Number(input.ensembleConfig[strategyId]) || 0) > 0);
  if (!Object.keys(ensemble).length) {
    if (!activeEnsembleAlphaIds.length) {
      warningsByCandidate.ensemble.push(`ensemble: ${warningDate} no active component strategies, emitted empty weights`);
    } else if (!activeStrategyIds.length) {
      warningsByCandidate.ensemble.push(`ensemble: ${warningDate} all active component strategies unavailable, emitted empty weights`);
    }
  }

  return {
    weightsByCandidate: {
      baseline,
      momentum: single.momentum,
      riskParity: single.riskParity,
      minVariance: single.minVariance,
      equalWeight,
      ensemble,
    },
    warningsByCandidate,
  };
}

function buildInitialHoldings(holdings: Record<string, number> | undefined, symbols: string[]): Record<string, number> | undefined {
  if (!holdings) return undefined;
  const allow = new Set(symbols);
  const filtered: Record<string, number> = {};
  for (const [symbolRaw, qtyRaw] of Object.entries(holdings)) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    if (!allow.has(symbol)) continue;
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    filtered[symbol] = qty;
  }
  return Object.keys(filtered).length ? filtered : undefined;
}

function sliceSeriesWindow(
  seriesBySymbol: Record<string, PriceBar[]>,
  startIndex: number,
  endIndexExclusive: number,
): Record<string, PriceBar[]> {
  const out: Record<string, PriceBar[]> = {};
  for (const [symbol, series] of Object.entries(seriesBySymbol || {})) {
    out[symbol] = (series || []).slice(startIndex, endIndexExclusive);
  }
  return out;
}

function buildZeroCandidateTimeline(dates: string[]): Record<StrategyLabCandidateId, Record<string, Record<string, number>>> {
  const out = {} as Record<StrategyLabCandidateId, Record<string, Record<string, number>>>;
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_) {
    out[candidateId] = {};
    for (const date of dates) out[candidateId][date] = {};
  }
  return out;
}

function fillStaticCandidateTimeline(input: {
  dates: string[];
  timeline: Record<string, Record<string, number>>;
  weights: Record<string, number>;
  preserveCash?: boolean;
}) {
  const weights = input.preserveCash ? normalizeWeightsPreservingCash(input.weights) : normalizeWeights(input.weights);
  for (const date of input.dates) {
    input.timeline[date] = weights;
  }
}

function computeAverageWeights(input: {
  dates: string[];
  timeline: Record<string, Record<string, number>>;
  symbols: string[];
}): Record<string, number> {
  if (!input.dates.length) return {};

  const totals: Record<string, number> = {};
  for (const date of input.dates) {
    const weights = input.timeline[date] || {};
    for (const symbol of input.symbols) {
      totals[symbol] = (totals[symbol] || 0) + Math.max(0, Number(weights[symbol]) || 0);
    }
  }

  const averaged: Record<string, number> = {};
  for (const symbol of input.symbols) {
    const avg = (totals[symbol] || 0) / input.dates.length;
    if (avg > 0) averaged[symbol] = avg;
  }
  return averaged;
}

function pickLastNonEmptyWeights(input: {
  dates: string[];
  timeline: Record<string, Record<string, number>>;
  fallback: Record<string, number>;
  preserveCash?: boolean;
}): Record<string, number> {
  const normalize = input.preserveCash ? normalizeWeightsPreservingCash : normalizeWeights;
  for (let i = input.dates.length - 1; i >= 0; i -= 1) {
    const weights = normalize(input.timeline[input.dates[i]] || {});
    if (Object.keys(weights).length > 0) return weights;
  }
  return normalize(input.fallback);
}

function buildCandidateTimelines(input: {
  dates: string[];
  symbols: string[];
  seriesBySymbol: Record<string, PriceBar[]>;
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbol;
  baselineTargetWeights: Record<string, number>;
  ensembleConfig: StrategyLabEnsembleConfig;
  lookbackBars: number;
}): {
  targetWeightsByCandidateByDate: Record<StrategyLabCandidateId, Record<string, Record<string, number>>>;
  weightsByCandidate: Record<StrategyLabCandidateId, Record<string, number>>;
  averageWeightsByCandidate: Record<StrategyLabCandidateId, Record<string, number>>;
  warningsByCandidate: Record<StrategyLabCandidateId, string[]>;
} {
  const targetWeightsByCandidateByDate = buildZeroCandidateTimeline(input.dates);
  const baselineFallback = normalizeWeightsPreservingCash(input.baselineTargetWeights);
  const equalWeightFallback = buildEqualWeightTargetWeights(input.symbols);
  fillStaticCandidateTimeline({
    dates: input.dates,
    timeline: targetWeightsByCandidateByDate.baseline,
    weights: baselineFallback,
    preserveCash: true,
  });
  fillStaticCandidateTimeline({
    dates: input.dates,
    timeline: targetWeightsByCandidateByDate.equalWeight,
    weights: equalWeightFallback,
  });
  const warningBuckets = {
    baseline: new Set<string>(),
    momentum: new Set<string>(),
    riskParity: new Set<string>(),
    minVariance: new Set<string>(),
    equalWeight: new Set<string>(),
    ensemble: new Set<string>(),
  } satisfies Record<StrategyLabCandidateId, Set<string>>;

  for (let i = input.lookbackBars; i < input.dates.length; i += 1) {
    const decisionDate = input.dates[i];
    const windowSeries = sliceSeriesWindow(input.seriesBySymbol, i - input.lookbackBars, i);
    const stats = computeSeriesStats({ seriesBySymbol: windowSeries, observedDatesBySymbol: input.observedDatesBySymbol });
    const candidateWindow = buildWeightsByCandidateForWindow({
      symbols: input.symbols,
      baselineTargetWeights: input.baselineTargetWeights,
      periodReturnsBySymbol: stats.periodReturnsBySymbol,
      volBySymbol: stats.volBySymbol,
      covMatrixBySymbol: stats.covMatrixBySymbol,
      ensembleConfig: input.ensembleConfig,
      decisionDate,
    });

    for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_) {
      targetWeightsByCandidateByDate[candidateId][decisionDate] = candidateWindow.weightsByCandidate[candidateId] || {};
      for (const warning of candidateWindow.warningsByCandidate[candidateId] || []) {
        warningBuckets[candidateId].add(warning);
      }
    }
  }

  const weightsByCandidate = {} as Record<StrategyLabCandidateId, Record<string, number>>;
  const averageWeightsByCandidate = {} as Record<StrategyLabCandidateId, Record<string, number>>;
  const warningsByCandidate = {} as Record<StrategyLabCandidateId, string[]>;
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_) {
    const fallback = candidateId === "baseline" || candidateId === "equalWeight"
      ? (candidateId === "baseline" ? baselineFallback : equalWeightFallback)
      : {};
    weightsByCandidate[candidateId] = pickLastNonEmptyWeights({
      dates: input.dates,
      timeline: targetWeightsByCandidateByDate[candidateId],
      fallback,
      preserveCash: candidateId === "baseline",
    });
    averageWeightsByCandidate[candidateId] = computeAverageWeights({
      dates: input.dates,
      timeline: targetWeightsByCandidateByDate[candidateId],
      symbols: input.symbols,
    });
    warningsByCandidate[candidateId] = [...warningBuckets[candidateId]];
  }

  return {
    targetWeightsByCandidateByDate,
    weightsByCandidate,
    averageWeightsByCandidate,
    warningsByCandidate,
  };
}

export type SeriesAlignmentMode = "intersection" | "ffill_union";

export type PreparedSeriesDiagnostics = {
  mode: SeriesAlignmentMode;
  minBars: number;
  inputSymbolCount: number;
  outputSymbolCount: number;
  unionDateCount: number;
  commonDateCount: number;
  startDate: string;
  endDate: string;
  droppedSymbols: string[];
  barsBySymbol: Record<string, { raw: number; cleaned: number; aligned: number; ffillCount: number }>;
};

export function prepareAlignedSeriesBySymbolWithDiagnostics(
  rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>,
  opts: { mode?: SeriesAlignmentMode; minBars?: number } = {},
): PreparedAlignedSeriesResult {
  const mode: SeriesAlignmentMode = opts.mode === "ffill_union" ? "ffill_union" : "intersection";
  const minBars = Math.max(2, Math.trunc(Number(opts.minBars) || 2));

  const cleanedBySymbol: Record<string, PriceBar[]> = {};
  const observedDatesBySymbol: StrategyLabObservedDatesBySymbol = {};
  const barsBySymbol: Record<string, { raw: number; cleaned: number; aligned: number; ffillCount: number }> = {};

  for (const [symbolRaw, seriesRaw] of Object.entries(rawSeriesBySymbol || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    if (!symbol || !Array.isArray(seriesRaw)) continue;
    const rawCount = seriesRaw.length;

    const validBars = seriesRaw
      .map((bar) => ({
        date: String(bar?.date || "").trim(),
        close: Number(bar?.close),
      }))
      .filter((bar) => Boolean(bar.date) && Number.isFinite(bar.close) && bar.close > 0);

    const dateMap = new Map<string, number>();
    for (const bar of validBars) {
      dateMap.set(bar.date, bar.close);
    }

    const cleaned = [...dateMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, close]) => ({ date, close }));

    barsBySymbol[symbol] = {
      raw: rawCount,
      cleaned: cleaned.length,
      aligned: 0,
      ffillCount: 0,
    };

    if (cleaned.length >= 2) {
      cleanedBySymbol[symbol] = cleaned;
      observedDatesBySymbol[symbol] = cleaned.map((bar) => bar.date);
    }
  }

  const symbols = Object.keys(cleanedBySymbol).sort();
  const diagnosticsBase: PreparedSeriesDiagnostics = {
    mode,
    minBars,
    inputSymbolCount: Object.keys(rawSeriesBySymbol || {}).length,
    outputSymbolCount: 0,
    unionDateCount: 0,
    commonDateCount: 0,
    startDate: "",
    endDate: "",
    droppedSymbols: [],
    barsBySymbol,
  };

  if (!symbols.length) {
    return {
      seriesBySymbol: {},
      diagnostics: diagnosticsBase,
      observedDatesBySymbol: {},
    };
  }

  const unionDates = new Set<string>();
  for (const symbol of symbols) {
    for (const bar of cleanedBySymbol[symbol]) {
      unionDates.add(bar.date);
    }
  }
  const sortedUnionDates = [...unionDates].sort();

  let aligned: Record<string, PriceBar[]> = {};
  let alignedDateCount = 0;
  let alignedStartDate = "";
  let alignedEndDate = "";
  if (mode === "intersection") {
    let commonDates = new Set<string>(cleanedBySymbol[symbols[0]].map((bar) => bar.date));
    for (const symbol of symbols.slice(1)) {
      const dates = new Set(cleanedBySymbol[symbol].map((bar) => bar.date));
      commonDates = new Set([...commonDates].filter((date) => dates.has(date)));
    }

    const sortedDates = [...commonDates].sort();
    alignedDateCount = sortedDates.length;
    alignedStartDate = sortedDates[0] || "";
    alignedEndDate = sortedDates[sortedDates.length - 1] || "";
    for (const symbol of symbols) {
      const map = new Map(cleanedBySymbol[symbol].map((bar) => [bar.date, bar.close]));
      aligned[symbol] = sortedDates.map((date) => ({ date, close: Number(map.get(date) || 0) }));
      observedDatesBySymbol[symbol] = [...sortedDates];
    }
  } else {
    const perSymbolMap: Record<string, Map<string, number>> = {};
    const lastBySymbol: Record<string, number | undefined> = {};
    for (const symbol of symbols) {
      perSymbolMap[symbol] = new Map(cleanedBySymbol[symbol].map((bar) => [bar.date, bar.close]));
      lastBySymbol[symbol] = undefined;
      aligned[symbol] = [];
    }

    for (const date of sortedUnionDates) {
      let allReady = true;
      const row: Record<string, number> = {};

      for (const symbol of symbols) {
        const direct = perSymbolMap[symbol].get(date);
        if (Number.isFinite(direct) && (direct as number) > 0) {
          lastBySymbol[symbol] = direct as number;
        } else if (lastBySymbol[symbol] !== undefined) {
          barsBySymbol[symbol].ffillCount += 1;
        }

        const value = lastBySymbol[symbol];
        if (!(Number.isFinite(value) && (value as number) > 0)) {
          allReady = false;
          break;
        }
        row[symbol] = value as number;
      }

      if (!allReady) continue;
      for (const symbol of symbols) {
        aligned[symbol].push({ date, close: row[symbol] });
      }
    }
    const firstSymbol = symbols[0];
    alignedDateCount = aligned[firstSymbol]?.length || 0;
    alignedStartDate = alignedDateCount ? aligned[firstSymbol][0].date : "";
    alignedEndDate = alignedDateCount ? aligned[firstSymbol][alignedDateCount - 1].date : "";
  }

  const droppedSymbols: string[] = [];
  for (const symbol of Object.keys(aligned)) {
    const count = aligned[symbol]?.length || 0;
    const observedCount = observedDatesBySymbol[symbol]?.length || 0;
    barsBySymbol[symbol] = {
      ...(barsBySymbol[symbol] || { raw: 0, cleaned: 0, aligned: 0, ffillCount: 0 }),
      aligned: count,
    };
    if (observedCount < minBars) {
      droppedSymbols.push(symbol);
      delete aligned[symbol];
    }
  }

  const keptSymbols = Object.keys(aligned).sort();
  diagnosticsBase.unionDateCount = sortedUnionDates.length;
  diagnosticsBase.commonDateCount = alignedDateCount;
  diagnosticsBase.startDate = alignedStartDate;
  diagnosticsBase.endDate = alignedEndDate;
  diagnosticsBase.droppedSymbols = droppedSymbols;
  diagnosticsBase.outputSymbolCount = keptSymbols.length;

  const keptObservedDatesBySymbol = Object.fromEntries(
    keptSymbols.map((symbol) => [symbol, [...(observedDatesBySymbol[symbol] || [])]]),
  ) as StrategyLabObservedDatesBySymbol;

  return {
    seriesBySymbol: keptSymbols.length ? aligned : {},
    diagnostics: diagnosticsBase,
    observedDatesBySymbol: keptObservedDatesBySymbol,
  };
}

export function prepareAlignedSeriesBySymbol(
  rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>,
  opts: { mode?: SeriesAlignmentMode; minBars?: number } = {},
): Record<string, PriceBar[]> {
  return prepareAlignedSeriesBySymbolWithDiagnostics(rawSeriesBySymbol, opts).seriesBySymbol;
}

export function runStrategyLabBacktests(input: {
  seriesBySymbol: Record<string, PriceBar[]>;
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbol;
  executableDatesBySymbol?: StrategyLabObservedDatesBySymbol;
  baselineTargetWeights: Record<string, number>;
  ensembleConfig: StrategyLabEnsembleConfig;
  lookbackBars?: number;
  initialHoldings?: Record<string, number>;
  initialCash?: number;
  initialEquity?: number;
  constraints?: DriftRebalanceBacktestRequest["constraints"];
  policy?: DriftRebalanceBacktestRequest["policy"];
  execution?: DriftRebalanceBacktestRequest["execution"];
}): StrategyLabRunResult {
  const symbols = Object.keys(input.seriesBySymbol || {}).sort();
  if (!symbols.length) throw new Error("seriesBySymbol is required");

  const dates = input.seriesBySymbol[symbols[0]].map((bar) => bar.date);
  if (dates.length < 2) throw new Error("at least 2 bars are required");

  const lookbackBars = Math.max(2, Math.trunc(Number(input.lookbackBars) || 252));
  const candidateTimelines = buildCandidateTimelines({
    dates,
    symbols,
    seriesBySymbol: input.seriesBySymbol,
    observedDatesBySymbol: input.observedDatesBySymbol,
    baselineTargetWeights: input.baselineTargetWeights,
    ensembleConfig: input.ensembleConfig,
    lookbackBars,
  });

  const initialHoldings = buildInitialHoldings(input.initialHoldings, symbols);

  const candidates: StrategyLabCandidateResult[] = [];
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_) {
    const bootstrapToTarget = candidateId === "baseline" || candidateId === "equalWeight";
    const backtest: DriftRebalanceBacktestResult = backtestDriftRebalance({
      seriesBySymbol: input.seriesBySymbol,
      targetWeights: candidateTimelines.weightsByCandidate[candidateId],
      targetWeightsByDate: candidateTimelines.targetWeightsByCandidateByDate[candidateId],
      executableDatesBySymbol: input.executableDatesBySymbol,
      initialHoldings,
      initialCash: input.initialCash,
      initialEquity: initialHoldings ? undefined : input.initialEquity,
      constraints: input.constraints,
      policy: input.policy,
      execution: input.execution,
      bootstrapToTarget,
      includeEventStates: true,
      includeTimeline: true,
    });

    candidates.push({
      id: candidateId,
      label: STRATEGY_LABELS_[candidateId],
      targetWeights: candidateTimelines.weightsByCandidate[candidateId],
      targetWeightsByDate: candidateTimelines.targetWeightsByCandidateByDate[candidateId],
      averageTargetWeights: candidateTimelines.averageWeightsByCandidate[candidateId],
      warnings: candidateTimelines.warningsByCandidate[candidateId],
      backtest,
    });
  }

  return {
    symbols,
    dates,
    seriesBySymbol: input.seriesBySymbol,
    weightsByCandidate: candidateTimelines.weightsByCandidate,
    candidates,
  };
}

export function buildTargetWeightDiffRows(
  currentWeights: Record<string, number>,
  nextWeights: Record<string, number>,
): StrategyLabWeightDiffRow[] {
  const current = normalizeWeightsPreservingCash(currentWeights || {});
  const next = normalizeWeightsPreservingCash(nextWeights || {});

  const allSymbols = [...new Set([...Object.keys(current), ...Object.keys(next)])].sort();

  const rows = allSymbols
    .map((symbol) => {
      const currentWeight = Number(current[symbol] || 0);
      const nextWeight = Number(next[symbol] || 0);
      return {
        symbol,
        currentWeight,
        nextWeight,
        deltaWeight: nextWeight - currentWeight,
      } satisfies StrategyLabWeightDiffRow;
    })
    .filter((row) => Math.abs(row.deltaWeight) > 1e-8)
    .sort((left, right) => Math.abs(right.deltaWeight) - Math.abs(left.deltaWeight) || left.symbol.localeCompare(right.symbol));

  return rows;
}
