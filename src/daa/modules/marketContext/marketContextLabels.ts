import type {
  DaaMarketIndicatorScope,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";

export type DaaMarketActionLevel = "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";

export const ACTIONABLE_MARKET_SCOPES_: DaaMarketIndicatorScope[] = [
  "us_equity",
  "hk_cn_equity",
  "crypto",
];

export function isActionableMarketScope(scope: string | null | undefined): boolean {
  return ACTIONABLE_MARKET_SCOPES_.includes(scope as DaaMarketIndicatorScope);
}

export function classifyMarketActionByRiskOffScore(scorePct: number | null | undefined): DaaMarketActionLevel {
  const score = Number.isFinite(scorePct) ? Number(scorePct) : 50;
  if (score <= 20) return "strong_buy";
  if (score <= 40) return "buy";
  if (score < 65) return "hold";
  if (score < 80) return "sell";
  return "strong_sell";
}

export function marketActionLabelZh(action: DaaMarketActionLevel): string {
  if (action === "strong_buy") return "强烈买入";
  if (action === "buy") return "买入";
  if (action === "sell") return "卖出";
  if (action === "strong_sell") return "强烈卖出";
  return "持有";
}

export function marketActionByRiskOffScoreLabelZh(scorePct: number | null | undefined): string {
  return marketActionLabelZh(classifyMarketActionByRiskOffScore(scorePct));
}

export function marketRegimeActionLabelZh(regime: DaaMarketRegime | string | null | undefined): string {
  if (regime === "risk_on") return "买入/加仓";
  if (regime === "risk_off") return "减仓/回避";
  if (regime === "transitional") return "持有/观察";
  return "待计算";
}

export function marketRegimeEnvironmentLabelZh(regime: DaaMarketRegime | string | null | undefined): string {
  if (regime === "risk_on") return "风险偏好强";
  if (regime === "risk_off") return "风险收缩";
  if (regime === "transitional") return "过渡观望";
  return "待计算";
}

export function marketPressureLabelZh(scorePct: number | null | undefined): string {
  const score = Number.isFinite(scorePct) ? Number(scorePct) : 50;
  if (score <= 20) return "风险很低";
  if (score <= 40) return "风险偏低";
  if (score < 65) return "风险中性";
  if (score < 80) return "风险偏高";
  return "风险很高";
}

export function marketScopeMetricLabelZh(scope: string | null | undefined): string {
  if (isActionableMarketScope(scope)) return "新增买入预算";
  if (scope === "macro_defensive") return "避险需求";
  if (scope === "macro_global") return "宏观风险";
  return "风险指数";
}

export function marketScopeMeaningZh(scope: string | null | undefined): string {
  if (scope === "us_equity") return "衡量美股是否适合继续增加风险资产，不等于目标仓位。";
  if (scope === "hk_cn_equity") return "衡量港股和中概是否适合继续增加风险资产，不等于目标仓位。";
  if (scope === "crypto") return "衡量加密市场是否适合继续增加风险资产，不等于目标仓位。";
  if (scope === "macro_defensive") return "看是否需要额外提高现金、黄金、短债等防御仓。";
  if (scope === "macro_global") return "看通胀、美元、利率等是否正在压制整体风险资产。";
  return "衡量当前市场环境对新交易的影响。";
}

function marketPressureLevelZh(scorePct: number | null | undefined): string {
  const score = Number.isFinite(scorePct) ? Number(scorePct) : 50;
  if (score <= 20) return "很低";
  if (score <= 40) return "偏低";
  if (score < 65) return "中性";
  if (score < 80) return "偏高";
  return "很高";
}

export function marketScopePrimaryLabelZh(input: {
  scope: string | null | undefined;
  riskOffScorePct: number | null | undefined;
  regime?: DaaMarketRegime | string | null;
}): string {
  if (isActionableMarketScope(input.scope)) {
    return marketActionByRiskOffScoreLabelZh(input.riskOffScorePct);
  }
  const level = marketPressureLevelZh(input.riskOffScorePct);
  if (input.scope === "macro_defensive") return `避险需求${level}`;
  if (input.scope === "macro_global") return `宏观风险${level}`;
  return `风险${level}`;
}
