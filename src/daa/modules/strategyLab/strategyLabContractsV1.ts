import type { BacktestAttribution } from "@/src/core/backtest/attribution";
import type { DriftRebalanceBacktestRequest } from "@/src/core/backtestDriftRebalance";

import type {
  StrategyLabCandidateIdV1,
  StrategyLabCandidateResultV1,
  StrategyLabEnsembleConfigV1,
} from "./strategyLabTypesV1";

export type StrategyLabRunAssetInputV1 = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  label?: string;
  yfinanceSymbol?: string;
  currentWeightPct?: number;
  currentTargetWeightPct?: number;
  holdingQty?: number;
  watchEnabled?: boolean;
};

export type StrategyLabAlignmentModeV1 = "intersection" | "ffill_union";

export type StrategyLabRunScenarioIdV1 = "ideal" | "executable";

export type StrategyLabRunConstraintSettingsV1 = {
  maxPositionPct: number;
  minNotional: number;
  maxOrderPctOfNav: number;
};

export type StrategyLabRunPolicySettingsV1 = {
  thresholdPct: number;
  minTradeNotional: number;
  cooldownSeconds: number;
};

export type StrategyLabRunExecutionSettingsV1 = {
  timing: "t_plus_1_close";
  feeRateBps: number;
  slippageBps: number;
};

export type StrategyLabPreparedSeriesDiagnosticsV1 = {
  mode: StrategyLabAlignmentModeV1;
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

export type StrategyLabRunInputV1 = {
  assets: StrategyLabRunAssetInputV1[];
  startDate: string;
  endDate: string;
  benchmarkSymbol?: string;
  alignmentMode?: StrategyLabAlignmentModeV1;
  minBars?: number;
  lookbackBars?: number;
  baseCurrency?: string;
  ensembleConfig?: Partial<StrategyLabEnsembleConfigV1>;
  initialEquity?: number;
  constraints?: DriftRebalanceBacktestRequest["constraints"];
  policy?: DriftRebalanceBacktestRequest["policy"];
  execution?: DriftRebalanceBacktestRequest["execution"];
};

export type StrategyLabRunCandidateViewV1 = StrategyLabCandidateResultV1 & {
  score: number;
  attribution: BacktestAttribution;
};

export type StrategyLabExecutionGapSourceIdV1 = "fee" | "slippage" | "tradeFloor" | "tradeCaps";

export type StrategyLabExecutionGapSourceImpactV1 = {
  sourceId: StrategyLabExecutionGapSourceIdV1;
  label: string;
  description: string;
  returnImpact: number;
  sharpeImpact: number;
  turnoverDelta: number;
  rebalanceDelta: number;
};

export type StrategyLabCandidateScenarioComparisonV1 = {
  candidateId: StrategyLabCandidateIdV1;
  idealRank: number | null;
  executableRank: number | null;
  rankDelta: number | null;
  executionGap: number;
  sharpeGap: number;
  turnoverDelta: number;
  rebalanceDelta: number;
  sourceBreakdown: StrategyLabExecutionGapSourceImpactV1[];
};

export type StrategyLabRunScenarioViewV1 = {
  scenarioId: StrategyLabRunScenarioIdV1;
  label: string;
  description: string;
  assumptions: string[];
  constraints: StrategyLabRunConstraintSettingsV1;
  policy: StrategyLabRunPolicySettingsV1;
  execution: StrategyLabRunExecutionSettingsV1;
  candidates: StrategyLabRunCandidateViewV1[];
  bestCandidateId: StrategyLabCandidateIdV1 | null;
  warnings: string[];
};

export type StrategyLabRunResultV1 = {
  generatedAt: string;
  benchmark: {
    symbol: string;
    dates: string[];
    equity: number[];
    totalReturn: number;
  };
  baseCurrency: string;
  lookbackBars: number;
  assetsUsed: StrategyLabRunAssetInputV1[];
  diagnostics: StrategyLabPreparedSeriesDiagnosticsV1;
  currentTargetWeights: Record<string, number>;
  currentActualWeights: Record<string, number>;
  scenarios: StrategyLabRunScenarioViewV1[];
  candidateComparisons: StrategyLabCandidateScenarioComparisonV1[];
  defaultScenarioId: StrategyLabRunScenarioIdV1;
  candidates: StrategyLabRunCandidateViewV1[];
  bestCandidateId: StrategyLabCandidateIdV1 | null;
  warnings: string[];
};

export type StrategyLabWritebackInputV1 = {
  candidateId: StrategyLabCandidateIdV1;
  scopeAssetKeys: string[];
  weightsByAssetKey: Record<string, number>;
};

export type StrategyLabWritebackResultV1 = {
  candidateId: StrategyLabCandidateIdV1;
  updatedAssetKeys: string[];
  updatedCount: number;
  clearedConfigTargetWeights: boolean;
  wroteAt: string;
};
