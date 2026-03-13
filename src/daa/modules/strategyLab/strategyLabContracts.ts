import type { BacktestAttribution } from "@/src/core/backtest/attribution";
import type { DriftRebalanceBacktestRequest } from "@/src/core/backtestDriftRebalance";

import type {
  StrategyLabCandidateId,
  StrategyLabCandidateResult,
  StrategyLabEnsembleConfig,
} from "./strategyLabTypes";

export type StrategyLabRunAssetInput = {
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

export type StrategyLabAlignmentMode = "intersection" | "ffill_union";

export type StrategyLabRunScenarioId = "ideal" | "executable";

export type StrategyLabRunConstraintSettings = {
  maxPositionPct: number;
  minNotional: number;
  maxOrderPctOfNav: number;
};

export type StrategyLabRunPolicySettings = {
  thresholdPct: number;
  minTradeNotional: number;
  cooldownSeconds: number;
};

export type StrategyLabRunExecutionSettings = {
  timing: "t_plus_1_close";
  feeRateBps: number;
  slippageBps: number;
};

export type StrategyLabPreparedSeriesDiagnostics = {
  mode: StrategyLabAlignmentMode;
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

export type StrategyLabRunInput = {
  assets: StrategyLabRunAssetInput[];
  startDate: string;
  endDate: string;
  benchmarkSymbol?: string;
  alignmentMode?: StrategyLabAlignmentMode;
  minBars?: number;
  lookbackBars?: number;
  baseCurrency?: string;
  ensembleConfig?: Partial<StrategyLabEnsembleConfig>;
  initialEquity?: number;
  constraints?: DriftRebalanceBacktestRequest["constraints"];
  policy?: DriftRebalanceBacktestRequest["policy"];
  execution?: DriftRebalanceBacktestRequest["execution"];
};

export type StrategyLabRunCandidateView = StrategyLabCandidateResult & {
  score: number;
  attribution: BacktestAttribution;
};

export type StrategyLabExecutionGapSourceId = "fee" | "slippage" | "tradeFloor" | "tradeCaps";

export type StrategyLabExecutionGapSourceImpact = {
  sourceId: StrategyLabExecutionGapSourceId;
  label: string;
  description: string;
  returnImpact: number;
  sharpeImpact: number;
  turnoverDelta: number;
  rebalanceDelta: number;
};

export type StrategyLabCandidateScenarioComparison = {
  candidateId: StrategyLabCandidateId;
  idealRank: number | null;
  executableRank: number | null;
  rankDelta: number | null;
  executionGap: number;
  sharpeGap: number;
  turnoverDelta: number;
  rebalanceDelta: number;
  sourceBreakdown: StrategyLabExecutionGapSourceImpact[];
};

export type StrategyLabRunScenarioView = {
  scenarioId: StrategyLabRunScenarioId;
  label: string;
  description: string;
  assumptions: string[];
  constraints: StrategyLabRunConstraintSettings;
  policy: StrategyLabRunPolicySettings;
  execution: StrategyLabRunExecutionSettings;
  candidates: StrategyLabRunCandidateView[];
  bestCandidateId: StrategyLabCandidateId | null;
  warnings: string[];
};

export type StrategyLabRunResult = {
  generatedAt: string;
  benchmark: {
    symbol: string;
    dates: string[];
    equity: Array<number | null>;
    totalReturn: number | null;
    coverage: "full" | "partial" | "missing";
  };
  baseCurrency: string;
  lookbackBars: number;
  assetsUsed: StrategyLabRunAssetInput[];
  diagnostics: StrategyLabPreparedSeriesDiagnostics;
  currentTargetWeights: Record<string, number>;
  currentActualWeights: Record<string, number>;
  scenarios: StrategyLabRunScenarioView[];
  candidateComparisons: StrategyLabCandidateScenarioComparison[];
  defaultScenarioId: StrategyLabRunScenarioId;
  candidates: StrategyLabRunCandidateView[];
  bestCandidateId: StrategyLabCandidateId | null;
  warnings: string[];
};

export type StrategyLabWritebackInput = {
  candidateId: StrategyLabCandidateId;
  scopeAssetKeys: string[];
  weightsByAssetKey: Record<string, number>;
};

export type StrategyLabWritebackResult = {
  candidateId: StrategyLabCandidateId;
  updatedAssetKeys: string[];
  updatedCount: number;
  clearedConfigTargetWeights: boolean;
  wroteAt: string;
};
