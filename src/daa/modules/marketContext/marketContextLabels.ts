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
  if (action === "strong_buy") return "适合加仓";
  if (action === "buy") return "可以小幅加仓";
  if (action === "sell") return "暂不加仓";
  if (action === "strong_sell") return "明显不适合加仓";
  return "先观察";
}

export function marketActionByRiskOffScoreLabelZh(scorePct: number | null | undefined): string {
  return marketActionLabelZh(classifyMarketActionByRiskOffScore(scorePct));
}

export function marketIndicatorSignalLabelZh(input: {
  riskOffScorePct: number | null | undefined;
}): string {
  const score = Number.isFinite(input.riskOffScorePct) ? Number(input.riskOffScorePct) : 50;
  if (score <= 20) return "风险压力很低";
  if (score <= 40) return "风险压力偏低";
  if (score < 65) return "风险压力中性";
  if (score < 80) return "风险压力偏高";
  return "风险压力很高";
}

export function marketRegimeActionLabelZh(regime: DaaMarketRegime | string | null | undefined): string {
  if (regime === "risk_on") return "环境偏积极";
  if (regime === "risk_off") return "环境偏谨慎";
  if (regime === "transitional") return "环境中性";
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
  if (isActionableMarketScope(scope)) return "加仓环境";
  if (scope === "macro_defensive") return "避险需求";
  if (scope === "macro_global") return "宏观压力";
  if (scope === "macro_policy") return "政策压力";
  return "风险指数";
}

export function marketScopeMeaningZh(scope: string | null | undefined): string {
  if (scope === "us_equity") return "只说明美股市场现在是否适合加仓；不是具体订单。";
  if (scope === "hk_cn_equity") return "只说明港股和中概现在是否适合加仓；不是具体订单。";
  if (scope === "crypto") return "只说明加密市场现在是否适合加仓；不是具体订单。";
  if (scope === "macro_defensive") return "看是否需要额外提高现金、黄金、短债等防御仓。";
  if (scope === "macro_global") return "看通胀、美元、利率等是否正在压制整体风险资产。";
  if (scope === "macro_policy") return "看 PPI、降息路径、缩表等政策环境是否正在改变风险预算。";
  return "衡量当前市场环境对交易节奏的影响。";
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
  if (input.scope === "macro_global") return `宏观压力${level}`;
  if (input.scope === "macro_policy") return `政策压力${level}`;
  return `风险${level}`;
}
