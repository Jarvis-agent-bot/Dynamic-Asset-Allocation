type ISODate = string;

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
  annualizedReturn: number;
  annualizationFactor: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
};
