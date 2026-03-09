export type DaaMarketRegimeV1 = "risk_on" | "transitional" | "risk_off";

export type DaaMarketIndicatorKeyV1 =
  | "vix"
  | "qqq_spy_ratio"
  | "fxi_volatility"
  | "kweb_fxi_ratio"
  | "btc_eth_ratio"
  | "btc_volatility"
  | "gold_silver_ratio";

export type DaaMarketIndicatorCategoryV1 = "volatility" | "relative_value" | "sentiment";
export type DaaMarketIndicatorScopeV1 = "us_equity" | "hk_cn_equity" | "crypto" | "macro_defensive";

export type DaaMarketIndicatorSnapshotV1 = {
  key: DaaMarketIndicatorKeyV1;
  label: string;
  category: DaaMarketIndicatorCategoryV1;
  scope: DaaMarketIndicatorScopeV1;
  stance: DaaMarketRegimeV1 | "neutral";
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

export type DaaMarketScopeContextV1 = {
  scope: DaaMarketIndicatorScopeV1;
  label: string;
  generatedAt: string;
  regime: DaaMarketRegimeV1;
  riskOffScorePct: number;
  confidencePct: number;
  buyScale: number;
  highRiskBuyScale: number;
  reasons: string[];
  indicators: DaaMarketIndicatorSnapshotV1[];
};

export type DaaMarketContextV1 = {
  generatedAt: string;
  regime: DaaMarketRegimeV1;
  riskOffScorePct: number;
  confidencePct: number;
  buyScale: number;
  highRiskBuyScale: number;
  reasons: string[];
  indicators: DaaMarketIndicatorSnapshotV1[];
  scopes: DaaMarketScopeContextV1[];
};

export type DaaMarketContextAttributionV1 = {
  scope: DaaMarketIndicatorScopeV1 | "portfolio";
  scopeLabel: string;
  relevantKeys: DaaMarketIndicatorKeyV1[];
  explanation: string[];
  buyScale: number | null;
  highRiskBuyScale: number | null;
};
