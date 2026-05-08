export type ISODate = string;

export type PriceBar = {
  date: ISODate;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type BacktestMetrics = {
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
};

export type Action = "BUY" | "SELL" | "HOLD";
