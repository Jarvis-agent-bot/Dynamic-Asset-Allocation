export type ISODate = string;

export type PriceBar = {
  date: ISODate;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

/**
 * A strategy returns a target weight per bar (single-asset v0), 0..1.
 * Length must match the input series.
 */
export type Strategy = {
  id: string;
  name: string;
  weights: (series: PriceBar[]) => number[];
};

export type BacktestMetrics = {
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
};

export type BacktestResult = {
  strategyId: string;
  strategyName: string;
  equity: number[];
  dailyReturns: number[];
  metrics: BacktestMetrics;
};

export type Action = "BUY" | "SELL" | "HOLD";

export type Signal = {
  date: ISODate;
  action: Action;
  targetWeight: number;
  confidence: number; // 0..1
  reasons: string[];
};

export type SignalThresholds = {
  buyAbove: number;
  sellBelow: number;
  minChange: number;
};
