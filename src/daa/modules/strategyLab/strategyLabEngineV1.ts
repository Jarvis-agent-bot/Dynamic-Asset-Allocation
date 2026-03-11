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
  minVariance: "低波防守",
  equalWeight: "均衡基线",
  ensemble: "组合候选",
};

function toPositiveFiniteNumberV1(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function normalizeWeightsV1(input: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  let sum = 0;
  for (const [symbolRaw, valueRaw] of Object.entries(input || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const value = toPositiveFiniteNumberV1(valueRaw, 0);
    if (!symbol || value <= 0) continue;
    cleaned[symbol] = value;
    sum += value;
  }

  if (sum <= 0) return {};

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

function computeDailyReturnsV1(series: PriceBar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = Number(series[i - 1]?.close);
    const next = Number(series[i]?.close);
    if (!(Number.isFinite(prev) && Number.isFinite(next) && prev > 0 && next > 0)) {
      out.push(0);
      continue;
    }
    out.push(next / prev - 1);
  }
  return out;
}

function computeSeriesStatsV1(seriesBySymbol: Record<string, PriceBar[]>): {
  periodReturnsBySymbol: Record<string, number>;
  volBySymbol: Record<string, number>;
  covMatrixBySymbol: Record<string, Record<string, number>>;
} {
  const symbols = Object.keys(seriesBySymbol).sort();
  const periodReturnsBySymbol: Record<string, number> = {};
  const volBySymbol: Record<string, number> = {};
  const dailyReturnsBySymbol: Record<string, number[]> = {};

  for (const symbol of symbols) {
    const series = seriesBySymbol[symbol] || [];
    if (series.length < 2) continue;

    const first = Number(series[0]?.close);
    const last = Number(series[series.length - 1]?.close);
    if (!(Number.isFinite(first) && Number.isFinite(last) && first > 0 && last > 0)) continue;

    const dailyReturns = computeDailyReturnsV1(series);
    dailyReturnsBySymbol[symbol] = dailyReturns;
    periodReturnsBySymbol[symbol] = last / first - 1;
    volBySymbol[symbol] = stdDevV1(dailyReturns);
  }

  const covMatrixBySymbol: Record<string, Record<string, number>> = {};
  const activeSymbols = Object.keys(dailyReturnsBySymbol).sort();
  for (const left of activeSymbols) {
    covMatrixBySymbol[left] = {};
    for (const right of activeSymbols) {
      covMatrixBySymbol[left][right] = covarianceV1(dailyReturnsBySymbol[left], dailyReturnsBySymbol[right]);
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
}): Record<StrategyLabCandidateIdV1, Record<string, number>> {
  const equalWeight = buildEqualWeightTargetWeightsV1(input.symbols);
  const baseline = normalizeWeightsV1(input.baselineTargetWeights);

  const single: Record<StrategyLabSingleStrategyIdV1, Record<string, number>> = {
    momentum: normalizeWeightsV1(buildMomentumTargetWeightsV1(input.periodReturnsBySymbol)),
    riskParity: normalizeWeightsV1(buildRiskParityTargetWeightsV1(input.volBySymbol)),
    minVariance: normalizeWeightsV1(buildMinVarianceTargetWeightsV1(input.covMatrixBySymbol)),
    equalWeight: normalizeWeightsV1(equalWeight),
  };

  const normalizedSingles: Record<StrategyLabSingleStrategyIdV1, Record<string, number>> = {
    momentum: Object.keys(single.momentum).length ? single.momentum : equalWeight,
    riskParity: Object.keys(single.riskParity).length ? single.riskParity : equalWeight,
    minVariance: Object.keys(single.minVariance).length ? single.minVariance : equalWeight,
    equalWeight,
  };

  const ensemble = buildEnsembleWeightsV1(normalizedSingles, input.ensembleConfig);

  return {
    baseline: baseline,
    momentum: normalizedSingles.momentum,
    riskParity: normalizedSingles.riskParity,
    minVariance: normalizedSingles.minVariance,
    equalWeight,
    ensemble: Object.keys(ensemble).length ? ensemble : equalWeight,
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
}): Record<string, number> {
  for (let i = input.dates.length - 1; i >= 0; i -= 1) {
    const weights = normalizeWeightsV1(input.timeline[input.dates[i]] || {});
    if (Object.keys(weights).length > 0) return weights;
  }
  return normalizeWeightsV1(input.fallback);
}

function buildCandidateTimelinesV1(input: {
  dates: string[];
  symbols: string[];
  seriesBySymbol: Record<string, PriceBar[]>;
  baselineTargetWeights: Record<string, number>;
  ensembleConfig: StrategyLabEnsembleConfigV1;
  lookbackBars: number;
}): {
  targetWeightsByCandidateByDate: Record<StrategyLabCandidateIdV1, Record<string, Record<string, number>>>;
  weightsByCandidate: Record<StrategyLabCandidateIdV1, Record<string, number>>;
  averageWeightsByCandidate: Record<StrategyLabCandidateIdV1, Record<string, number>>;
} {
  const targetWeightsByCandidateByDate = buildZeroCandidateTimelineV1(input.dates);
  const staticFallbacks = buildWeightsByCandidateForWindowV1({
    symbols: input.symbols,
    baselineTargetWeights: input.baselineTargetWeights,
    periodReturnsBySymbol: {},
    volBySymbol: {},
    covMatrixBySymbol: {},
    ensembleConfig: input.ensembleConfig,
  });

  for (let i = input.lookbackBars; i < input.dates.length; i += 1) {
    const decisionDate = input.dates[i];
    const windowSeries = sliceSeriesWindowV1(input.seriesBySymbol, i - input.lookbackBars, i);
    const stats = computeSeriesStatsV1(windowSeries);
    const candidateWeights = buildWeightsByCandidateForWindowV1({
      symbols: input.symbols,
      baselineTargetWeights: input.baselineTargetWeights,
      periodReturnsBySymbol: stats.periodReturnsBySymbol,
      volBySymbol: stats.volBySymbol,
      covMatrixBySymbol: stats.covMatrixBySymbol,
      ensembleConfig: input.ensembleConfig,
    });

    for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
      targetWeightsByCandidateByDate[candidateId][decisionDate] = candidateWeights[candidateId] || {};
    }
  }

  const weightsByCandidate = {} as Record<StrategyLabCandidateIdV1, Record<string, number>>;
  const averageWeightsByCandidate = {} as Record<StrategyLabCandidateIdV1, Record<string, number>>;
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
    const fallback = candidateId === "baseline" || candidateId === "equalWeight"
      ? staticFallbacks[candidateId]
      : {};
    weightsByCandidate[candidateId] = pickLastNonEmptyWeightsV1({
      dates: input.dates,
      timeline: targetWeightsByCandidateByDate[candidateId],
      fallback,
    });
    averageWeightsByCandidate[candidateId] = computeAverageWeightsV1({
      dates: input.dates,
      timeline: targetWeightsByCandidateByDate[candidateId],
      symbols: input.symbols,
    });
  }

  return {
    targetWeightsByCandidateByDate,
    weightsByCandidate,
    averageWeightsByCandidate,
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
): { seriesBySymbol: Record<string, PriceBar[]>; diagnostics: PreparedSeriesDiagnosticsV1 } {
  const mode: SeriesAlignmentModeV1 = opts.mode === "ffill_union" ? "ffill_union" : "intersection";
  const minBars = Math.max(2, Math.trunc(Number(opts.minBars) || 2));

  const cleanedBySymbol: Record<string, PriceBar[]> = {};
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
    barsBySymbol[symbol] = {
      ...(barsBySymbol[symbol] || { raw: 0, cleaned: 0, aligned: 0, ffillCount: 0 }),
      aligned: count,
    };
    if (count < minBars) {
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

  return {
    seriesBySymbol: keptSymbols.length ? aligned : {},
    diagnostics: diagnosticsBase,
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
    baselineTargetWeights: input.baselineTargetWeights,
    ensembleConfig: input.ensembleConfig,
    lookbackBars,
  });

  const initialHoldings = buildInitialHoldingsV1(input.initialHoldings, symbols);

  const candidates: StrategyLabCandidateResultV1[] = [];
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
    const backtest: DriftRebalanceBacktestResult = backtestDriftRebalance({
      seriesBySymbol: input.seriesBySymbol,
      targetWeights: candidateTimelines.weightsByCandidate[candidateId],
      targetWeightsByDate: candidateTimelines.targetWeightsByCandidateByDate[candidateId],
      initialHoldings,
      initialCash: input.initialCash,
      initialEquity: initialHoldings ? undefined : input.initialEquity,
      constraints: input.constraints,
      policy: input.policy,
      execution: input.execution,
      bootstrapToTarget: false,
      includeEventStates: true,
      includeTimeline: true,
    });

    candidates.push({
      id: candidateId,
      label: STRATEGY_LABELS_V1[candidateId],
      targetWeights: candidateTimelines.weightsByCandidate[candidateId],
      targetWeightsByDate: candidateTimelines.targetWeightsByCandidateByDate[candidateId],
      averageTargetWeights: candidateTimelines.averageWeightsByCandidate[candidateId],
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
  const current = normalizeWeightsV1(currentWeights || {});
  const next = normalizeWeightsV1(nextWeights || {});

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
