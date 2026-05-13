import { clamp } from "@/src/core/math";
import type { DaaMarketIndicatorsConfig } from "@/src/daa/config/systemConfig";
import { classifyMacroCycleWithFred, type FredMacroInput } from "@/src/daa/modules/marketContext/macroCycleClassifier";
import {
  MARKET_INDICATOR_CONFIG_KEY_BY_KEY_,
  MARKET_INDICATOR_KEYS_,
  MARKET_SCOPE_KEY_ORDER_,
  MARKET_SCOPE_LABEL_ZH_,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type {
  DaaMarketContext,
  DaaMarketIndicatorScope,
  DaaMarketIndicatorSnapshot,
  DaaMarketRegime,
  DaaMarketScopeContext,
} from "@/src/daa/modules/marketContext/marketContextTypes";

const ACTIONABLE_SCOPES: DaaMarketIndicatorScope[] = ["us_equity", "hk_cn_equity", "crypto"];


function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function scopePriority(scope: DaaMarketIndicatorScope): number {
  return ACTIONABLE_SCOPES.includes(scope) ? 2 : 1;
}

function compareScopeRisk(a: DaaMarketScopeContext, b: DaaMarketScopeContext): number {
  const regimeDiff = compareMarketRegimePriority(b.regime) - compareMarketRegimePriority(a.regime);
  if (regimeDiff !== 0) return regimeDiff;
  const scoreDiff = b.riskOffScorePct - a.riskOffScorePct;
  if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
  return scopePriority(b.scope) - scopePriority(a.scope);
}

function rankMarketIndicatorReasons(input: {
  indicators: DaaMarketIndicatorSnapshot[];
  config: DaaMarketIndicatorsConfig;
}): string[] {
  return [...input.indicators]
    .sort((a, b) => {
      const weightA = input.config.indicators[MARKET_INDICATOR_CONFIG_KEY_BY_KEY_[a.key]]?.weight ?? 0;
      const weightB = input.config.indicators[MARKET_INDICATOR_CONFIG_KEY_BY_KEY_[b.key]]?.weight ?? 0;
      const scoreA = weightA * Math.abs(a.riskOffScorePct - 50);
      const scoreB = weightB * Math.abs(b.riskOffScorePct - 50);
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map((item) => item.reason);
}

export function deriveMarketRegime(
  riskOffScorePct: number,
  thresholds?: { riskOffThreshold: number; riskOnThreshold: number },
): DaaMarketRegime {
  const riskOff = thresholds?.riskOffThreshold ?? 65;
  const riskOn = thresholds?.riskOnThreshold ?? 40;
  if (riskOffScorePct >= riskOff) return "risk_off";
  if (riskOffScorePct < riskOn) return "risk_on";
  return "transitional";
}

function buildScopedContext(input: {
  scope: DaaMarketIndicatorScope;
  indicators: DaaMarketIndicatorSnapshot[];
  config: DaaMarketIndicatorsConfig;
}): DaaMarketScopeContext | null {
  const enabledIndicators = input.indicators.filter((indicator) => {
    if (indicator.scope !== input.scope) return false;
    const configKey = MARKET_INDICATOR_CONFIG_KEY_BY_KEY_[indicator.key];
    return input.config.indicators[configKey]?.enabled;
  });
  if (enabledIndicators.length <= 0) return null;

  const weightedRows = enabledIndicators
    .map((indicator) => {
      const configKey = MARKET_INDICATOR_CONFIG_KEY_BY_KEY_[indicator.key];
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
  const regime = deriveMarketRegime(riskOffScorePct);

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
    label: MARKET_SCOPE_LABEL_ZH_[input.scope],
    generatedAt: Number.isFinite(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString(),
    regime,
    riskOffScorePct: round(riskOffScorePct),
    confidencePct: round(confidencePct),
    buyScale: round(buyScale),
    highRiskBuyScale: round(highRiskBuyScale),
    reasons: rankMarketIndicatorReasons({ indicators: enabledIndicators, config: input.config }),
    indicators: MARKET_INDICATOR_KEYS_
      .map((key) => enabledIndicators.find((item) => item.key === key) || null)
      .filter(Boolean) as DaaMarketIndicatorSnapshot[],
  };
}

export function buildMarketContextFromIndicators(input: {
  indicators: DaaMarketIndicatorSnapshot[];
  config: DaaMarketIndicatorsConfig;
  fredMacro?: FredMacroInput | null;
}): DaaMarketContext | null {
  const scopes = MARKET_SCOPE_KEY_ORDER_
    .map((scope) => buildScopedContext({ scope, indicators: input.indicators, config: input.config }))
    .filter((item): item is DaaMarketScopeContext => Boolean(item));
  if (scopes.length <= 0) return null;

  const summaryScopes = scopes.filter((item) => ACTIONABLE_SCOPES.includes(item.scope));
  const summaryUniverse = summaryScopes.length > 0 ? summaryScopes : scopes;
  const topScope = [...summaryUniverse].sort(compareScopeRisk)[0] || scopes[0];
  if (!topScope) return null;

  const reasons = [
    ...topScope.reasons.map((item) => `${topScope.label}：${item}`),
    ...summaryUniverse
      .filter((item) => item.scope !== topScope.scope && item.regime === "risk_off")
      .slice(0, 2)
      .map((item) => `${item.label}：${item.reasons[0] || "风险压力升高"}`),
  ].slice(0, 4);

  const generatedAt = scopes
    .map((item) => Date.parse(item.generatedAt))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => b - a)[0];

  const enabledIndicators = MARKET_INDICATOR_KEYS_
    .map((key) => input.indicators.find((item) => item.key === key) || null)
    .filter(Boolean) as DaaMarketIndicatorSnapshot[];

  const result: DaaMarketContext = {
    generatedAt: Number.isFinite(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString(),
    regime: topScope.regime,
    riskOffScorePct: topScope.riskOffScorePct,
    confidencePct: topScope.confidencePct,
    buyScale: topScope.buyScale,
    highRiskBuyScale: topScope.highRiskBuyScale,
    reasons,
    indicators: enabledIndicators,
    scopes,
    macroCycle: classifyMacroCycleWithFred(input.fredMacro ?? null, enabledIndicators) ?? null,
  };

  return result;
}

function compareMarketRegimePriority(regime: DaaMarketRegime | null | undefined): number {
  if (regime === "risk_off") return 3;
  if (regime === "transitional") return 2;
  if (regime === "risk_on") return 1;
  return 0;
}

export function mergeMarketRegimeConservatively(
  ruleRegime: DaaMarketRegime | null | undefined,
  llmRegime: DaaMarketRegime | null | undefined,
): DaaMarketRegime | null {
  if (!ruleRegime && !llmRegime) return null;
  if (!ruleRegime) return llmRegime!;
  if (!llmRegime) return ruleRegime;
  // Both present: pick the more conservative (higher priority = more defensive)
  return compareMarketRegimePriority(ruleRegime) >= compareMarketRegimePriority(llmRegime)
    ? ruleRegime
    : llmRegime;
}
