import type { PriceBar } from "@/src/core/domain";
import type { DriftRebalanceBacktestResult } from "@/src/core/backtestDriftRebalance";

export type StrategyLabSingleStrategyIdV1 = "momentum" | "riskParity" | "minVariance" | "equalWeight";

export type StrategyLabCandidateIdV1 = "baseline" | StrategyLabSingleStrategyIdV1 | "ensemble";

export type StrategyLabEnsembleConfigV1 = Record<StrategyLabSingleStrategyIdV1, number>;

export type StrategyLabCandidateResultV1 = {
  id: StrategyLabCandidateIdV1;
  label: string;
  targetWeights: Record<string, number>;
  targetWeightsByDate: Record<string, Record<string, number>>;
  averageTargetWeights: Record<string, number>;
  backtest: DriftRebalanceBacktestResult;
};

export type StrategyLabRunResultV1 = {
  symbols: string[];
  dates: string[];
  seriesBySymbol: Record<string, PriceBar[]>;
  weightsByCandidate: Record<StrategyLabCandidateIdV1, Record<string, number>>;
  candidates: StrategyLabCandidateResultV1[];
};

export type StrategyLabWeightDiffRowV1 = {
  symbol: string;
  currentWeight: number;
  nextWeight: number;
  deltaWeight: number;
};
