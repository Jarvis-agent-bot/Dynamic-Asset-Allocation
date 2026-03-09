import type { DaaMarketIndicatorsConfigV2 } from "@/src/daa/config/systemConfigV2";
import {
  MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1,
  MARKET_INDICATOR_KEYS_V1,
  MARKET_SCOPE_KEY_ORDER_V1,
  MARKET_SCOPE_LABEL_ZH_V1,
  resolveMarketScopeForAssetV1,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import type {
  DaaMarketContextV1,
  DaaMarketIndicatorKeyV1,
  DaaMarketIndicatorScopeV1,
  DaaMarketIndicatorSnapshotV1,
  DaaMarketRegimeV1,
  DaaMarketScopeContextV1,
} from "@/src/daa/modules/marketContext/marketContextTypesV1";

const ACTIONABLE_SCOPES: DaaMarketIndicatorScopeV1[] = ["us_equity", "hk_cn_equity", "crypto"];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function scopePriority(scope: DaaMarketIndicatorScopeV1): number {
  return ACTIONABLE_SCOPES.includes(scope) ? 2 : 1;
}

function compareScopeRiskV1(a: DaaMarketScopeContextV1, b: DaaMarketScopeContextV1): number {
  const regimeDiff = compareMarketRegimePriorityV1(b.regime) - compareMarketRegimePriorityV1(a.regime);
  if (regimeDiff !== 0) return regimeDiff;
  const scoreDiff = b.riskOffScorePct - a.riskOffScorePct;
  if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
  return scopePriority(b.scope) - scopePriority(a.scope);
}

export function rankMarketIndicatorReasonsV1(input: {
  indicators: DaaMarketIndicatorSnapshotV1[];
  config: DaaMarketIndicatorsConfigV2;
}): string[] {
  return [...input.indicators]
    .sort((a, b) => {
      const weightA = input.config.indicators[MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1[a.key]]?.weight ?? 0;
      const weightB = input.config.indicators[MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1[b.key]]?.weight ?? 0;
      const scoreA = weightA * Math.abs(a.riskOffScorePct - 50);
      const scoreB = weightB * Math.abs(b.riskOffScorePct - 50);
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map((item) => item.reason);
}

export function deriveMarketRegimeV1(riskOffScorePct: number): DaaMarketRegimeV1 {
  if (riskOffScorePct >= 65) return "risk_off";
  if (riskOffScorePct < 40) return "risk_on";
  return "transitional";
}

function buildScopedContextV1(input: {
  scope: DaaMarketIndicatorScopeV1;
  indicators: DaaMarketIndicatorSnapshotV1[];
  config: DaaMarketIndicatorsConfigV2;
}): DaaMarketScopeContextV1 | null {
  const enabledIndicators = input.indicators.filter((indicator) => {
    if (indicator.scope !== input.scope) return false;
    const configKey = MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1[indicator.key];
    return input.config.indicators[configKey]?.enabled;
  });
  if (enabledIndicators.length <= 0) return null;

  const weightedRows = enabledIndicators
    .map((indicator) => {
      const configKey = MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1[indicator.key];
      const weight = Math.max(0, input.config.indicators[configKey]?.weight ?? 0);
      return { indicator, weight };
    })
    .filter((item) => item.weight > 0);

  const effectiveRows = weightedRows.length > 0
    ? weightedRows
    : enabledIndicators.map((indicator) => ({ indicator, weight: 1 / Math.max(1, enabledIndicators.length) }));
  const weightSum = effectiveRows.reduce((sum, item) => sum + item.weight, 0) || 1;

  const riskOffScorePct = effectiveRows.reduce(
    (sum, item) => sum + item.indicator.riskOffScorePct * (item.weight / weightSum),
    0,
  );
  const confidencePct = effectiveRows.reduce(
    (sum, item) => sum + item.indicator.confidencePct * (item.weight / weightSum),
    0,
  );
  const regime = deriveMarketRegimeV1(riskOffScorePct);

  const buyScale = regime === "risk_on"
    ? 1
    : regime === "transitional"
      ? clamp(input.config.overlays.transitionalBuyScale, 0.2, 1)
      : clamp(input.config.overlays.riskOffBuyScale, 0.2, 1);

  const highRiskBuyScale = regime === "risk_on"
    ? 0.95
    : regime === "transitional"
      ? Math.min(0.85, clamp(input.config.overlays.highRiskBuyScale, 0.1, 1) + 0.2)
      : clamp(input.config.overlays.highRiskBuyScale, 0.1, 1);

  const generatedAt = enabledIndicators
    .map((item) => Date.parse(item.generatedAt))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => b - a)[0];

  return {
    scope: input.scope,
    label: MARKET_SCOPE_LABEL_ZH_V1[input.scope],
    generatedAt: Number.isFinite(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString(),
    regime,
    riskOffScorePct: round(riskOffScorePct),
    confidencePct: round(confidencePct),
    buyScale: round(buyScale),
    highRiskBuyScale: round(highRiskBuyScale),
    reasons: rankMarketIndicatorReasonsV1({ indicators: enabledIndicators, config: input.config }),
    indicators: MARKET_INDICATOR_KEYS_V1
      .map((key) => enabledIndicators.find((item) => item.key === key) || null)
      .filter(Boolean) as DaaMarketIndicatorSnapshotV1[],
  };
}

export function buildMarketContextFromIndicatorsV1(input: {
  indicators: DaaMarketIndicatorSnapshotV1[];
  config: DaaMarketIndicatorsConfigV2;
}): DaaMarketContextV1 | null {
  const scopes = MARKET_SCOPE_KEY_ORDER_V1
    .map((scope) => buildScopedContextV1({ scope, indicators: input.indicators, config: input.config }))
    .filter((item): item is DaaMarketScopeContextV1 => Boolean(item));
  if (scopes.length <= 0) return null;

  const summaryScopes = scopes.filter((item) => ACTIONABLE_SCOPES.includes(item.scope));
  const summaryUniverse = summaryScopes.length > 0 ? summaryScopes : scopes;
  const topScope = [...summaryUniverse].sort(compareScopeRiskV1)[0] || scopes[0];
  if (!topScope) return null;

  const reasons = [
    ...topScope.reasons.map((item) => `${topScope.label}：${item}`),
    ...summaryUniverse
      .filter((item) => item.scope !== topScope.scope && item.regime === "risk_off")
      .slice(0, 2)
      .map((item) => `${item.label}：${item.reasons[0] || "环境偏防守"}`),
  ].slice(0, 4);

  const generatedAt = scopes
    .map((item) => Date.parse(item.generatedAt))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => b - a)[0];

  const enabledIndicators = MARKET_INDICATOR_KEYS_V1
    .map((key) => input.indicators.find((item) => item.key === key) || null)
    .filter(Boolean) as DaaMarketIndicatorSnapshotV1[];

  return {
    generatedAt: Number.isFinite(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString(),
    regime: topScope.regime,
    riskOffScorePct: topScope.riskOffScorePct,
    confidencePct: topScope.confidencePct,
    buyScale: topScope.buyScale,
    highRiskBuyScale: topScope.highRiskBuyScale,
    reasons,
    indicators: enabledIndicators,
    scopes,
  };
}

export function compareMarketRegimePriorityV1(regime: DaaMarketRegimeV1 | null | undefined): number {
  if (regime === "risk_off") return 3;
  if (regime === "transitional") return 2;
  if (regime === "risk_on") return 1;
  return 0;
}

export function mergeMarketRegimeConservativelyV1(
  ruleRegime: DaaMarketRegimeV1 | null | undefined,
  llmRegime: DaaMarketRegimeV1 | null | undefined,
): DaaMarketRegimeV1 | null {
  if (!ruleRegime && !llmRegime) return null;
  return compareMarketRegimePriorityV1(ruleRegime) >= compareMarketRegimePriorityV1(llmRegime)
    ? (ruleRegime || llmRegime || null)
    : (llmRegime || ruleRegime || null);
}

export function isHighRiskAssetV1(input: {
  symbol: string;
  holdingTags?: string[];
  watchTags?: string[];
  marketScope?: DaaMarketIndicatorScopeV1 | null;
}): boolean {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const riskSymbols = new Set(["ARKK", "TQQQ", "SOXL", "LABU", "BTC-USD", "ETH-USD", "SOL-USD"]);
  if (riskSymbols.has(symbol)) return true;
  if (input.marketScope === "crypto") return true;
  const tags = [
    ...(input.holdingTags || []),
    ...(input.watchTags || []),
  ].map((item) => String(item || "").trim().toLowerCase());
  return tags.some((tag) => ["high", "high-risk", "growth", "crypto", "leveraged", "theme"].includes(tag));
}

export function getIndicatorByKeyV1(
  marketContext: DaaMarketContextV1 | null | undefined,
  key: DaaMarketIndicatorKeyV1,
): DaaMarketIndicatorSnapshotV1 | null {
  return marketContext?.indicators.find((item) => item.key === key) || null;
}

export function getMarketScopeContextV1(
  marketContext: DaaMarketContextV1 | null | undefined,
  scope: DaaMarketIndicatorScopeV1 | null | undefined,
): DaaMarketScopeContextV1 | null {
  if (!marketContext || !scope) return null;
  const scopes = Array.isArray((marketContext as { scopes?: DaaMarketScopeContextV1[] }).scopes)
    ? (marketContext as { scopes?: DaaMarketScopeContextV1[] }).scopes || []
    : [];
  return scopes.find((item) => item.scope === scope) || null;
}

export function resolveRelevantMarketScopeContextV1(input: {
  marketContext: DaaMarketContextV1 | null | undefined;
  symbol: string;
  market?: string;
  assetClass?: string;
  marketGroup?: string;
  instrumentType?: string;
  region?: string;
  exchange?: string;
  holdingTags?: string[];
  watchTags?: string[];
}): DaaMarketScopeContextV1 | null {
  const scope = resolveMarketScopeForAssetV1(input);
  return getMarketScopeContextV1(input.marketContext, scope) || null;
}
