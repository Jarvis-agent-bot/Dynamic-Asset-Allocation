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

export type Action = "BUY" | "SELL" | "HOLD";
