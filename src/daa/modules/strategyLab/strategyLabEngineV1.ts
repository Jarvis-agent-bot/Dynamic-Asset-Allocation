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
  baseline: "当前配置（Baseline）",
  momentum: "Momentum",
  riskParity: "Risk Parity",
  minVariance: "Min Variance",
  equalWeight: "Equal Weight",
  ensemble: "Ensemble",
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
  for (let i = 0; i < left.length; i++) {
    sum += (left[i] - leftAvg) * (right[i] - rightAvg);
  }
  return sum / left.length;
}

function computeDailyReturnsV1(series: PriceBar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
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

function buildWeightsByCandidateV1(input: {
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
    baseline: Object.keys(baseline).length ? baseline : equalWeight,
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

export function prepareAlignedSeriesBySymbolV1(
  rawSeriesBySymbol: Record<string, Array<{ date: string; close: number }>>,
): Record<string, PriceBar[]> {
  const cleanedBySymbol: Record<string, PriceBar[]> = {};

  for (const [symbolRaw, seriesRaw] of Object.entries(rawSeriesBySymbol || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    if (!symbol || !Array.isArray(seriesRaw)) continue;

    const validBars = seriesRaw
      .map((bar) => ({
        date: String(bar?.date || "").trim(),
        close: Number(bar?.close),
      }))
      .filter((bar) => Boolean(bar.date) && Number.isFinite(bar.close) && bar.close > 0);

    if (validBars.length < 2) continue;

    const dateMap = new Map<string, number>();
    for (const bar of validBars) {
      dateMap.set(bar.date, bar.close);
    }

    cleanedBySymbol[symbol] = [...dateMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, close]) => ({ date, close }));
  }

  const symbols = Object.keys(cleanedBySymbol).sort();
  if (!symbols.length) return {};

  let commonDates = new Set<string>(cleanedBySymbol[symbols[0]].map((bar) => bar.date));
  for (const symbol of symbols.slice(1)) {
    const dates = new Set(cleanedBySymbol[symbol].map((bar) => bar.date));
    commonDates = new Set([...commonDates].filter((date) => dates.has(date)));
  }

  const sortedDates = [...commonDates].sort();
  if (sortedDates.length < 2) return {};

  const aligned: Record<string, PriceBar[]> = {};
  for (const symbol of symbols) {
    const map = new Map(cleanedBySymbol[symbol].map((bar) => [bar.date, bar.close]));
    aligned[symbol] = sortedDates.map((date) => ({ date, close: Number(map.get(date) || 0) }));
  }

  return aligned;
}

export function runStrategyLabBacktestsV1(input: {
  seriesBySymbol: Record<string, PriceBar[]>;
  baselineTargetWeights: Record<string, number>;
  ensembleConfig: StrategyLabEnsembleConfigV1;
  initialHoldings?: Record<string, number>;
  initialCash?: number;
  initialEquity?: number;
  constraints?: DriftRebalanceBacktestRequest["constraints"];
  policy?: DriftRebalanceBacktestRequest["policy"];
}): StrategyLabRunResultV1 {
  const symbols = Object.keys(input.seriesBySymbol || {}).sort();
  if (!symbols.length) throw new Error("seriesBySymbol is required");

  const dates = input.seriesBySymbol[symbols[0]].map((bar) => bar.date);
  if (dates.length < 2) throw new Error("at least 2 bars are required");

  const stats = computeSeriesStatsV1(input.seriesBySymbol);
  const weightsByCandidate = buildWeightsByCandidateV1({
    symbols,
    baselineTargetWeights: input.baselineTargetWeights,
    periodReturnsBySymbol: stats.periodReturnsBySymbol,
    volBySymbol: stats.volBySymbol,
    covMatrixBySymbol: stats.covMatrixBySymbol,
    ensembleConfig: input.ensembleConfig,
  });

  const initialHoldings = buildInitialHoldingsV1(input.initialHoldings, symbols);

  const candidates: StrategyLabCandidateResultV1[] = [];
  for (const candidateId of STRATEGY_LAB_CANDIDATE_ORDER_V1) {
    const backtest: DriftRebalanceBacktestResult = backtestDriftRebalance({
      seriesBySymbol: input.seriesBySymbol,
      targetWeights: weightsByCandidate[candidateId],
      initialHoldings,
      initialCash: input.initialCash,
      initialEquity: initialHoldings ? undefined : input.initialEquity,
      constraints: input.constraints,
      policy: input.policy,
      includeEventStates: true,
      includeTimeline: true,
    });

    candidates.push({
      id: candidateId,
      label: STRATEGY_LABELS_V1[candidateId],
      targetWeights: weightsByCandidate[candidateId],
      backtest,
    });
  }

  return {
    symbols,
    dates,
    seriesBySymbol: input.seriesBySymbol,
    weightsByCandidate,
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
