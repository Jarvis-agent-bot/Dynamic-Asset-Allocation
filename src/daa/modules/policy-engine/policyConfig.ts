import { DEFAULT_SYSTEM_CONFIG_, type DaaSystemConfig } from "@/src/daa/config/systemConfig";

import type { DaaPolicyConfig } from "./policyTypes";

function toLegacyDedupeHours(checkFrequency: "daily" | "weekly"): number {
  return checkFrequency === "weekly" ? 168 : 24;
}

export function resolvePolicyConfig(config: DaaSystemConfig): DaaPolicyConfig {
  const fallback = DEFAULT_SYSTEM_CONFIG_.policy;
  const legacy = config.rebalanceStrategy;
  const source = config.policy ?? fallback;
  const outerBandPct = Math.max(
    source.drift.innerBandPct + 0.005,
    source.drift.outerBandPct || legacy.drift.thresholdPct || fallback.drift.outerBandPct,
  );

  return {
    enabled: source.enabled !== false,
    shadowMode: source.shadowMode === true,
    drift: {
      enabled: source.drift.enabled !== false && legacy.drift.enabled !== false,
      mode: source.drift.mode === "volatility_adjusted" ? "volatility_adjusted" : "static_band",
      outerBandPct,
      innerBandPct: Math.max(0.001, Math.min(source.drift.innerBandPct || fallback.drift.innerBandPct, outerBandPct - 0.001)),
      minNotionalBase: Math.max(0, source.drift.minNotionalBase || config.strategy.constraints.minNotional || fallback.drift.minNotionalBase),
      volatilityLookbackDays: Math.max(5, Math.trunc(source.drift.volatilityLookbackDays || fallback.drift.volatilityLookbackDays)),
    },
    review: {
      enabled: source.review.enabled !== false && legacy.calendar.enabled !== false,
      frequency: source.review.frequency || legacy.calendar.frequency || fallback.review.frequency,
      dayOfMonth: Math.max(1, Math.min(28, Math.trunc(source.review.dayOfMonth || legacy.calendar.dayOfMonth || fallback.review.dayOfMonth))),
      scheduledTimeUtc: source.review.scheduledTimeUtc || legacy.analysisTimeUtc || fallback.review.scheduledTimeUtc,
      timezone: source.review.timezone || legacy.timezone || fallback.review.timezone,
    },
    throttle: {
      proposalDedupeWindowHours: Math.max(
        1,
        Math.trunc(source.throttle.proposalDedupeWindowHours || toLegacyDedupeHours(legacy.drift.checkFrequency)),
      ),
      autoExecutionCooldownHours: Math.max(1, Math.trunc(source.throttle.autoExecutionCooldownHours || legacy.cooldownHours || fallback.throttle.autoExecutionCooldownHours)),
      allowRiskReductionOverride: source.throttle.allowRiskReductionOverride !== false,
      allowSevereRiskOverride: source.throttle.allowSevereRiskOverride !== false,
      minScoreToBreakCooldown: Math.max(0, Math.min(100, source.throttle.minScoreToBreakCooldown || fallback.throttle.minScoreToBreakCooldown)),
    },
    actionScore: {
      proposalThreshold: Math.max(0, Math.min(100, source.actionScore.proposalThreshold || fallback.actionScore.proposalThreshold)),
      autoExecuteThreshold: Math.max(0, Math.min(100, source.actionScore.autoExecuteThreshold || fallback.actionScore.autoExecuteThreshold)),
    },
  };
}

