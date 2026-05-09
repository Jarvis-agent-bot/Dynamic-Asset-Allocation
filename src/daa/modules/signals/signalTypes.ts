export type PortfolioSignalSeverity = "info" | "warn" | "critical";

type BasePortfolioSignal = {
  signalId: string;
  type: "drift" | "risk" | "cash" | "agent_thesis" | "market_regime" | "news_event";
  source: string;
  severity: PortfolioSignalSeverity;
  asOf: string;
  evidence: string[];
};

export type DriftSignal = BasePortfolioSignal & {
  type: "drift";
  assetKey: string;
  symbol: string;
  actualWeightPct: number;
  targetWeightPct: number;
  driftPct: number;
  absDriftPct: number;
  volatilityAdjustedDrift: number;
  enteredOuterBand: boolean;
  exitedInnerBand: boolean;
};

export type RiskSignal = BasePortfolioSignal & {
  type: "risk";
  assetKey: string;
  symbol: string;
  riskKind: "stop_loss" | "take_profit" | "concentration" | "data_health";
  valuePct: number;
};

export type CashSignal = BasePortfolioSignal & {
  type: "cash";
  cashPct: number;
};

export type AgentThesisSignal = BasePortfolioSignal & {
  type: "agent_thesis";
  assetKeys: string[];
  confidencePct: number;
  thesis: string;
};

export type MarketRegimeSignal = BasePortfolioSignal & {
  type: "market_regime";
  regime: string;
  riskOffScorePct: number;
};

export type NewsEventSignal = BasePortfolioSignal & {
  type: "news_event";
  assetKeys: string[];
  headline: string;
};

export type PortfolioSignal =
  | DriftSignal
  | RiskSignal
  | CashSignal
  | AgentThesisSignal
  | MarketRegimeSignal
  | NewsEventSignal;

