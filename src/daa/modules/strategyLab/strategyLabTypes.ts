import type { PriceBar } from "@/src/core/domain";
import type { DriftRebalanceBacktestResult } from "@/src/core/backtestDriftRebalance";

export type StrategyLabSingleStrategyId = "momentum" | "riskParity" | "minVariance" | "equalWeight";

export type StrategyLabCandidateId = "baseline" | StrategyLabSingleStrategyId | "ensemble";

export type StrategyLabEnsembleConfig = Record<StrategyLabSingleStrategyId, number>;

export type StrategyLabCandidateResult = {
  id: StrategyLabCandidateId;
  label: string;
  targetWeights: Record<string, number>;
  targetWeightsByDate: Record<string, Record<string, number>>;
  averageTargetWeights: Record<string, number>;
  warnings: string[];
  backtest: DriftRebalanceBacktestResult;
};

export type StrategyLabRunResult = {
  symbols: string[];
  dates: string[];
  seriesBySymbol: Record<string, PriceBar[]>;
  weightsByCandidate: Record<StrategyLabCandidateId, Record<string, number>>;
  candidates: StrategyLabCandidateResult[];
};

export type StrategyLabWeightDiffRow = {
  symbol: string;
  currentWeight: number;
  nextWeight: number;
  deltaWeight: number;
};
