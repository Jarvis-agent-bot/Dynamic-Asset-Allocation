export type BacktestExecutionTiming = "same_bar_close" | "t_plus_1_close";

export type BacktestOrder = {
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
  reason?: string;
};

export type BacktestSignal = {
  date: string;
  shouldRebalance: boolean;
  targetWeights: Record<string, number>;
  orders: BacktestOrder[];
};

export type BacktestLedgerState = {
  holdings: Record<string, number>;
  cash: number;
};

export type BacktestMarketFrame = {
  date: string;
  prices: Record<string, number>;
};

export type BacktestExecutionResult = {
  state: BacktestLedgerState;
  executed: BacktestOrder[];
  turnoverNotional: number;
  feeNotional: number;
};

export interface BacktestDataLayer {
  frames(): BacktestMarketFrame[];
}

export interface BacktestSignalLayer {
  signal(args: {
    frame: BacktestMarketFrame;
    state: BacktestLedgerState;
    lastRebalanceAt: string;
  }): BacktestSignal;
}

export interface BacktestExecutionLayer {
  execute(args: {
    frame: BacktestMarketFrame;
    signal: BacktestSignal;
    state: BacktestLedgerState;
    timing: BacktestExecutionTiming;
  }): BacktestExecutionResult;
}

export interface BacktestMetricsLayer<TMetrics> {
  compute(args: { equityAbsByDay: number[]; dailyReturns: number[] }): TMetrics;
}
