export type DaaMarketRegime = "risk_on" | "transitional" | "risk_off";

export type DaaMarketIndicatorKey =
  | "vix"
  | "qqq_spy_ratio"
  | "fxi_volatility"
  | "kweb_fxi_ratio"
  | "btc_eth_ratio"
  | "btc_volatility"
  | "gold_silver_ratio";

export type DaaMarketIndicatorCategory = "volatility" | "relative_value" | "sentiment";
export type DaaMarketIndicatorScope = "us_equity" | "hk_cn_equity" | "crypto" | "macro_defensive";

export type DaaMarketIndicatorSnapshot = {
  key: DaaMarketIndicatorKey;
  label: string;
  category: DaaMarketIndicatorCategory;
  scope: DaaMarketIndicatorScope;
  stance: DaaMarketRegime | "neutral";
  riskOffScorePct: number;
  confidencePct: number;
  rawValue: number | null;
  unit?: string;
  percentile252?: number | null;
  zscore60?: number | null;
  trend1dPct?: number | null;
  trend7dPct?: number | null;
  trend30dPct?: number | null;
  reason: string;
  source: string;
  generatedAt: string;
};

export type DaaMarketScopeContext = {
  scope: DaaMarketIndicatorScope;
  label: string;
  generatedAt: string;
  regime: DaaMarketRegime;
  riskOffScorePct: number;
  confidencePct: number;
  buyScale: number;
  highRiskBuyScale: number;
  reasons: string[];
  indicators: DaaMarketIndicatorSnapshot[];
};

export type DaaMarketContext = {
  generatedAt: string;
  regime: DaaMarketRegime;
  riskOffScorePct: number;
  confidencePct: number;
  buyScale: number;
  highRiskBuyScale: number;
  reasons: string[];
  indicators: DaaMarketIndicatorSnapshot[];
  scopes: DaaMarketScopeContext[];
};

export type DaaMarketContextAttribution = {
  scope: DaaMarketIndicatorScope | "portfolio";
  scopeLabel: string;
  relevantKeys: DaaMarketIndicatorKey[];
  explanation: string[];
  buyScale: number | null;
  highRiskBuyScale: number | null;
};
