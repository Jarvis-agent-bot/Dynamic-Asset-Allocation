import {
  backtestDriftRebalance,
  type DriftRebalanceBacktestRequest,
  type DriftRebalanceBacktestResult,
} from "@/src/core/backtestDriftRebalance";
import type { PriceBar } from "@/src/core/domain";
import {
  buildEqualWeightTargetWeightsV1,
  buildMinVarianceTargetWeightsV1,
  buildMomentumTargetWeightsV1,
  buildRiskParityTargetWeightsV1,
} from "@/src/core/ensemble/strategy";
import type {
  StrategyLabCandidateIdV1,
  StrategyLabCandidateResultV1,
  StrategyLabEnsembleConfigV1,
  StrategyLabRunResultV1,
  StrategyLabSingleStrategyIdV1,
  StrategyLabWeightDiffRowV1,
} from "./strategyLabTypesV1";

const SINGLE_STRATEGY_ORDER_V1: StrategyLabSingleStrategyIdV1[] = ["momentum", "riskParity", "minVariance", "equalWeight"];

export const STRATEGY_LAB_CANDIDATE_ORDER_V1: StrategyLabCandidateIdV1[] = [
  "baseline",
  ...SINGLE_STRATEGY_ORDER_V1,
  "ensemble",
];

const STRATEGY_LABELS_V1: Record<StrategyLabCandidateIdV1, string> = {
  baseline: "当前配置",
  momentum: "趋势进攻",
  riskParity: "风险平衡",
  minVariance: "长仓最小方差",
  equalWeight: "均衡基线",
  ensemble: "组合候选",
};

type StrategyLabCandidateWindowBuildResultV1 = {
  weightsByCandidate: Record<StrategyLabCandidateIdV1, Record<string, number>>;
  warningsByCandidate: Record<StrategyLabCandidateIdV1, string[]>;
};

type StrategyLabObservedDatesBySymbolV1 = Record<string, string[]>;

type PreparedAlignedSeriesResultV1 = {
  seriesBySymbol: Record<string, PriceBar[]>;
  diagnostics: PreparedSeriesDiagnosticsV1;
  observedDatesBySymbol: StrategyLabObservedDatesBySymbolV1;
};

function toPositiveFiniteNumberV1(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function cleanWeightsV1(input: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  for (const [symbolRaw, valueRaw] of Object.entries(input || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const value = toPositiveFiniteNumberV1(valueRaw, 0);
    if (!symbol || value <= 0) continue;
    cleaned[symbol] = value;
  }
  return cleaned;
}

function normalizeWeightsV1(input: Record<string, number>): Record<string, number> {
  const cleaned = cleanWeightsV1(input);
  const sum = Object.values(cleaned).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return {};

  for (const symbol of Object.keys(cleaned)) {
    cleaned[symbol] = cleaned[symbol] / sum;
  }

  return cleaned;
}

function normalizeWeightsPreservingCashV1(input: Record<string, number>): Record<string, number> {
  const cleaned = cleanWeightsV1(input);
  const sum = Object.values(cleaned).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return {};
  if (sum <= 1.000001) return cleaned;

  for (const symbol of Object.keys(cleaned)) {
    cleaned[symbol] = cleaned[symbol] / sum;
  }

  return cleaned;
}

function meanV1(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function stdDevV1(values: number[]): number {
  if (!values.length) return 0;
  const avg = meanV1(values);
  const variance = values.reduce((sum, item) => sum + (item - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(variance, 0));
}

function covarianceV1(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  const leftAvg = meanV1(left);
  const rightAvg = meanV1(right);
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    sum += (left[i] - leftAvg) * (right[i] - rightAvg);
  }
  return sum / left.length;
}

function buildObservedDateSetV1(input: {
  symbol: string;
  series: PriceBar[];
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbolV1;
}): Set<string> {
  const fromInput = input.observedDatesBySymbol?.[input.symbol];
  if (Array.isArray(fromInput) && fromInput.length > 0) {
    return new Set(fromInput.map((date) => String(date || "").trim()).filter(Boolean));
  }
  return new Set((input.series || []).map((bar) => String(bar.date || "").trim()).filter(Boolean));
}

function buildObservedBarsV1(input: {
  symbol: string;
  series: PriceBar[];
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbolV1;
}): PriceBar[] {
  const observedDateSet = buildObservedDateSetV1(input);
  return (input.series || []).filter((bar) => {
    const date = String(bar.date || "").trim();
    const close = Number(bar.close);
    return observedDateSet.has(date) && Number.isFinite(close) && close > 0;
  });
}

function buildObservedReturnsByEndDateV1(series: PriceBar[]): Record<string, number> {
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

function computeSeriesStatsV1(input: {
  seriesBySymbol: Record<string, PriceBar[]>;
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbolV1;
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
    const observedBars = buildObservedBarsV1({
      symbol,
      series: input.seriesBySymbol[symbol] || [],
      observedDatesBySymbol: input.observedDatesBySymbol,
    });
    if (observedBars.length < 2) continue;

    const first = Number(observedBars[0]?.close);
    const last = Number(observedBars[observedBars.length - 1]?.close);
    if (!(Number.isFinite(first) && Number.isFinite(last) && first > 0 && last > 0)) continue;

    periodReturnsBySymbol[symbol] = last / first - 1;

    const returnsByEndDate = buildObservedReturnsByEndDateV1(observedBars);
    returnsByEndDateBySymbol[symbol] = returnsByEndDate;
    const returnValues = Object.values(returnsByEndDate).filter((value) => Number.isFinite(value));
    if (returnValues.length >= 2) {
      const volatility = stdDevV1(returnValues);
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
      const covariance = covarianceV1(leftValues, rightValues);
      if (Number.isFinite(covariance)) {
        row[right] = covariance;
      }
    }
    if (Object.keys(row).length > 0) {
      covMatrixBySymbol[left] = row;
    }
  }

  return { periodReturnsBySymbol, volBySymbol, covMatrixBySymbol };
}

function clampEnsembleConfigV1(input: StrategyLabEnsembleConfigV1): StrategyLabEnsembleConfigV1 {
  return {
    momentum: Math.max(0, Number(input.momentum) || 0),
    riskParity: Math.max(0, Number(input.riskParity) || 0),
    minVariance: Math.max(0, Number(input.minVariance) || 0),
    equalWeight: Math.max(0, Number(input.equalWeight) || 0),
  };
}

export function buildEnsembleWeightsV1(
  strategyWeights: Record<StrategyLabSingleStrategyIdV1, Record<string, number>>,
  ensembleConfig: StrategyLabEnsembleConfigV1,
): Record<string, number> {
  const config = clampEnsembleConfigV1(ensembleConfig);
  const out: Record<string, number> = {};

  for (const strategyId of SINGLE_STRATEGY_ORDER_V1) {
    const alpha = Number(config[strategyId]) || 0;
    if (alpha <= 0) continue;
    const bucket = strategyWeights[strategyId] || {};
    for (const [symbol, weightRaw] of Object.entries(bucket)) {
      const weight = toPositiveFiniteNumberV1(weightRaw, 0);
      if (weight <= 0) continue;
      out[symbol] = (out[symbol] || 0) + alpha * weight;
    }
  }

  return normalizeWeightsV1(out);
}

function buildWeightsByCandidateForWindowV1(input: {
  symbols: string[];
  baselineTargetWeights: Record<string, number>;
  periodReturnsBySymbol: Record<string, number>;
  volBySymbol: Record<string, number>;
  covMatrixBySymbol: Record<string, Record<string, number>>;
  ensembleConfig: StrategyLabEnsembleConfigV1;
  decisionDate?: string;
}): StrategyLabCandidateWindowBuildResultV1 {
  const equalWeight = buildEqualWeightTargetWeightsV1(input.symbols);
  const baseline = normalizeWeightsPreservingCashV1(input.baselineTargetWeights);
  const warningsByCandidate: Record<StrategyLabCandidateIdV1, string[]> = {
    baseline: [],
    momentum: [],
    riskParity: [],
    minVariance: [],
    equalWeight: [],
    ensemble: [],
  };

  const single: Record<StrategyLabSingleStrategyIdV1, Record<string, number>> = {
    momentum: normalizeWeightsV1(buildMomentumTargetWeightsV1(input.periodReturnsBySymbol)),
    riskParity: normalizeWeightsV1(buildRiskParityTargetWeightsV1(input.volBySymbol)),
    minVariance: normalizeWeightsV1(buildMinVarianceTargetWeightsV1(input.covMatrixBySymbol)),
    equalWeight: normalizeWeightsV1(equalWeight),
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

  const activeStrategyWeights = {} as Record<StrategyLabSingleStrategyIdV1, Record<string, number>>;
  const activeStrategyIds: StrategyLabSingleStrategyIdV1[] = [];
  for (const strategyId of SINGLE_STRATEGY_ORDER_V1) {
    const alpha = Number(input.ensembleConfig[strategyId]) || 0;
    const weights = single[strategyId] || {};
    activeStrategyWeights[strategyId] = weights;
    if (alpha > 0 && Object.keys(weights).length > 0) activeStrategyIds.push(strategyId);
  }

  const ensemble = buildEnsembleWeightsV1(activeStrategyWeights, input.ensembleConfig);
  const activeEnsembleAlphaIds = SINGLE_STRATEGY_ORDER_V1.filter((strategyId) => (Number(input.ensembleConfig[strategyId]) || 0) > 0);
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

function buildInitialHoldingsV1(holdings: Record<string, number> | undefined, symbols: string[]): Record<string, number> | undefined {
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

function sliceSeriesWindowV1(
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

function buildZeroCandidateTimelineV1(dates: string[]): Record<StrategyLabCandidateIdV1, Record<string, Record<string, number>>> {
  const out = {} as Record<StrategyLabCandidateIdV1, Record<string, Record<string, number>>>;
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
    out[candidateId] = {};
    for (const date of dates) out[candidateId][date] = {};
  }
  return out;
}

function fillStaticCandidateTimelineV1(input: {
  dates: string[];
  timeline: Record<string, Record<string, number>>;
  weights: Record<string, number>;
  preserveCash?: boolean;
}) {
  const weights = input.preserveCash ? normalizeWeightsPreservingCashV1(input.weights) : normalizeWeightsV1(input.weights);
  for (const date of input.dates) {
    input.timeline[date] = weights;
  }
}

function computeAverageWeightsV1(input: {
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

function pickLastNonEmptyWeightsV1(input: {
  dates: string[];
  timeline: Record<string, Record<string, number>>;
  fallback: Record<string, number>;
  preserveCash?: boolean;
}): Record<string, number> {
  const normalize = input.preserveCash ? normalizeWeightsPreservingCashV1 : normalizeWeightsV1;
  for (let i = input.dates.length - 1; i >= 0; i -= 1) {
    const weights = normalize(input.timeline[input.dates[i]] || {});
    if (Object.keys(weights).length > 0) return weights;
  }
  return normalize(input.fallback);
}

function buildCandidateTimelinesV1(input: {
  dates: string[];
  symbols: string[];
  seriesBySymbol: Record<string, PriceBar[]>;
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbolV1;
  baselineTargetWeights: Record<string, number>;
  ensembleConfig: StrategyLabEnsembleConfigV1;
  lookbackBars: number;
}): {
  targetWeightsByCandidateByDate: Record<StrategyLabCandidateIdV1, Record<string, Record<string, number>>>;
  weightsByCandidate: Record<StrategyLabCandidateIdV1, Record<string, number>>;
  averageWeightsByCandidate: Record<StrategyLabCandidateIdV1, Record<string, number>>;
  warningsByCandidate: Record<StrategyLabCandidateIdV1, string[]>;
} {
  const targetWeightsByCandidateByDate = buildZeroCandidateTimelineV1(input.dates);
  const baselineFallback = normalizeWeightsPreservingCashV1(input.baselineTargetWeights);
  const equalWeightFallback = buildEqualWeightTargetWeightsV1(input.symbols);
  fillStaticCandidateTimelineV1({
    dates: input.dates,
    timeline: targetWeightsByCandidateByDate.baseline,
    weights: baselineFallback,
    preserveCash: true,
  });
  fillStaticCandidateTimelineV1({
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
  } satisfies Record<StrategyLabCandidateIdV1, Set<string>>;

  for (let i = input.lookbackBars; i < input.dates.length; i += 1) {
    const decisionDate = input.dates[i];
    const windowSeries = sliceSeriesWindowV1(input.seriesBySymbol, i - input.lookbackBars, i);
    const stats = computeSeriesStatsV1({ seriesBySymbol: windowSeries, observedDatesBySymbol: input.observedDatesBySymbol });
    const candidateWindow = buildWeightsByCandidateForWindowV1({
      symbols: input.symbols,
      baselineTargetWeights: input.baselineTargetWeights,
      periodReturnsBySymbol: stats.periodReturnsBySymbol,
      volBySymbol: stats.volBySymbol,
      covMatrixBySymbol: stats.covMatrixBySymbol,
      ensembleConfig: input.ensembleConfig,
      decisionDate,
    });

    for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
      targetWeightsByCandidateByDate[candidateId][decisionDate] = candidateWindow.weightsByCandidate[candidateId] || {};
      for (const warning of candidateWindow.warningsByCandidate[candidateId] || []) {
        warningBuckets[candidateId].add(warning);
      }
    }
  }

  const weightsByCandidate = {} as Record<StrategyLabCandidateIdV1, Record<string, number>>;
  const averageWeightsByCandidate = {} as Record<StrategyLabCandidateIdV1, Record<string, number>>;
  const warningsByCandidate = {} as Record<StrategyLabCandidateIdV1, string[]>;
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
    const fallback = candidateId === "baseline" || candidateId === "equalWeight"
      ? (candidateId === "baseline" ? baselineFallback : equalWeightFallback)
      : {};
    weightsByCandidate[candidateId] = pickLastNonEmptyWeightsV1({
      dates: input.dates,
      timeline: targetWeightsByCandidateByDate[candidateId],
      fallback,
      preserveCash: candidateId === "baseline",
    });
    averageWeightsByCandidate[candidateId] = computeAverageWeightsV1({
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

export type SeriesAlignmentModeV1 = "intersection" | "ffill_union";

export type PreparedSeriesDiagnosticsV1 = {
  mode: SeriesAlignmentModeV1;
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

export function prepareAlignedSeriesBySymbolWithDiagnosticsV1(
  rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>,
  opts: { mode?: SeriesAlignmentModeV1; minBars?: number } = {},
): PreparedAlignedSeriesResultV1 {
  const mode: SeriesAlignmentModeV1 = opts.mode === "ffill_union" ? "ffill_union" : "intersection";
  const minBars = Math.max(2, Math.trunc(Number(opts.minBars) || 2));

  const cleanedBySymbol: Record<string, PriceBar[]> = {};
  const observedDatesBySymbol: StrategyLabObservedDatesBySymbolV1 = {};
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
  const diagnosticsBase: PreparedSeriesDiagnosticsV1 = {
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
  ) as StrategyLabObservedDatesBySymbolV1;

  return {
    seriesBySymbol: keptSymbols.length ? aligned : {},
    diagnostics: diagnosticsBase,
    observedDatesBySymbol: keptObservedDatesBySymbol,
  };
}

export function prepareAlignedSeriesBySymbolV1(
  rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>,
  opts: { mode?: SeriesAlignmentModeV1; minBars?: number } = {},
): Record<string, PriceBar[]> {
  return prepareAlignedSeriesBySymbolWithDiagnosticsV1(rawSeriesBySymbol, opts).seriesBySymbol;
}

export function runStrategyLabBacktestsV1(input: {
  seriesBySymbol: Record<string, PriceBar[]>;
  observedDatesBySymbol?: StrategyLabObservedDatesBySymbolV1;
  executableDatesBySymbol?: StrategyLabObservedDatesBySymbolV1;
  baselineTargetWeights: Record<string, number>;
  ensembleConfig: StrategyLabEnsembleConfigV1;
  lookbackBars?: number;
  initialHoldings?: Record<string, number>;
  initialCash?: number;
  initialEquity?: number;
  constraints?: DriftRebalanceBacktestRequest["constraints"];
  policy?: DriftRebalanceBacktestRequest["policy"];
  execution?: DriftRebalanceBacktestRequest["execution"];
}): StrategyLabRunResultV1 {
  const symbols = Object.keys(input.seriesBySymbol || {}).sort();
  if (!symbols.length) throw new Error("seriesBySymbol is required");

  const dates = input.seriesBySymbol[symbols[0]].map((bar) => bar.date);
  if (dates.length < 2) throw new Error("at least 2 bars are required");

  const lookbackBars = Math.max(2, Math.trunc(Number(input.lookbackBars) || 252));
  const candidateTimelines = buildCandidateTimelinesV1({
    dates,
    symbols,
    seriesBySymbol: input.seriesBySymbol,
    observedDatesBySymbol: input.observedDatesBySymbol,
    baselineTargetWeights: input.baselineTargetWeights,
    ensembleConfig: input.ensembleConfig,
    lookbackBars,
  });

  const initialHoldings = buildInitialHoldingsV1(input.initialHoldings, symbols);

  const candidates: StrategyLabCandidateResultV1[] = [];
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
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
      label: STRATEGY_LABELS_V1[candidateId],
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

export function buildTargetWeightDiffRowsV1(
  currentWeights: Record<string, number>,
  nextWeights: Record<string, number>,
): StrategyLabWeightDiffRowV1[] {
  const current = normalizeWeightsPreservingCashV1(currentWeights || {});
  const next = normalizeWeightsPreservingCashV1(nextWeights || {});

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
      } satisfies StrategyLabWeightDiffRowV1;
    })
    .filter((row) => Math.abs(row.deltaWeight) > 1e-8)
    .sort((left, right) => Math.abs(right.deltaWeight) - Math.abs(left.deltaWeight) || left.symbol.localeCompare(right.symbol));

  return rows;
}
