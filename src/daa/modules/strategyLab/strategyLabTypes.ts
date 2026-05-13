import type { BacktestMetrics } from "@/src/core/domain";
import type { BacktestAttribution } from "@/src/core/backtest/attribution";

// ---------------------------------------------------------------------------
// 请求参数
// ---------------------------------------------------------------------------

export type StrategyLabRunParams = {
  /** 资产列表，格式 MARKET::SYMBOL（如 US::AAPL）或纯 symbol（默认 US 市场） */
  assets: string[];
  /** 策略列表：equalWeight / momentum / riskParity / minVariance / baseline */
  strategies: string[];
  /** 起始日期 YYYY-MM-DD */
  startDate: string;
  /** 结束日期 YYYY-MM-DD */
  endDate: string;
  /** 再平衡频率：monthly / quarterly / semiannual / annual */
  rebalanceFrequency: string;
  /** 初始资金 */
  initialCapital: number;
  /** 基准货币（默认 USD） */
  baseCurrency?: string;
  /** 基准 symbol（默认 SPY） */
  benchmarkSymbol?: string;
  /** 手续费 bps */
  feeRateBps?: number;
  /** 滑点 bps */
  slippageBps?: number;
};

// ---------------------------------------------------------------------------
// 结果
// ---------------------------------------------------------------------------

export type StrategyLabEquityPoint = {
  date: string;
  equity: number;
};

export type StrategyLabStrategyResult = {
  strategy: string;
  equityCurve: StrategyLabEquityPoint[];
  metrics: BacktestMetrics;
  attribution: BacktestAttribution;
  targetWeights: Record<string, number>;
  warnings: string[];
};

export type StrategyLabRunResult = {
  runId: string;
  createdAt: string;
  baseCurrency: string;
  params: StrategyLabRunParams;
  strategyResults: StrategyLabStrategyResult[];
  primaryStrategy: string;
  equityCurve: StrategyLabEquityPoint[];
  metrics: BacktestMetrics;
  attribution: BacktestAttribution;
  targetWeights: Record<string, number>;
  warnings: string[];
};

export type StrategyLabHistoryItem = {
  runId: string;
  createdAt: string;
  baseCurrency: string;
  startDate: string;
  endDate: string;
  params: StrategyLabRunParams;
  metrics: BacktestMetrics;
};
