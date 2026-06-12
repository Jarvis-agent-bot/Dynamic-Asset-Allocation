import { DEFAULT_SYSTEM_CONFIG, type DaaSystemConfig } from "@/src/daa/config/systemConfig";

import type { DaaPolicyConfig } from "./policyTypes";

function finiteNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function resolvePolicyConfig(config: DaaSystemConfig): DaaPolicyConfig {
  const fallback = DEFAULT_SYSTEM_CONFIG.policy;
  const source = config.policy;
  const rawInnerBandPct = finiteNumber(source.drift.innerBandPct, fallback.drift.innerBandPct);
  const outerBandPct = Math.max(
    rawInnerBandPct + 0.005,
    finiteNumber(source.drift.outerBandPct, fallback.drift.outerBandPct),
  );
  const innerBandPct = Math.max(
    0.001,
    Math.min(rawInnerBandPct, outerBandPct - 0.001),
  );

  return {
    enabled: source.enabled !== false,
    shadowMode: source.shadowMode === true,
    drift: {
      enabled: source.drift.enabled !== false,
      mode: source.drift.mode === "volatility_adjusted" ? "volatility_adjusted" : "static_band",
      outerBandPct,
      innerBandPct,
      minNotionalBase: Math.max(0, finiteNumber(source.drift.minNotionalBase, config.strategy.constraints.minNotional)),
      volatilityLookbackDays: Math.max(5, Math.trunc(finiteNumber(source.drift.volatilityLookbackDays, fallback.drift.volatilityLookbackDays))),
    },
    review: {
      enabled: source.review.enabled !== false,
      frequency: source.review.frequency ?? fallback.review.frequency,
      dayOfMonth: Math.max(1, Math.min(28, Math.trunc(finiteNumber(source.review.dayOfMonth, fallback.review.dayOfMonth)))),
      scheduledTimeUtc: source.review.scheduledTimeUtc ?? fallback.review.scheduledTimeUtc,
      timezone: source.review.timezone ?? fallback.review.timezone,
    },
    throttle: {
      proposalDedupeWindowHours: Math.max(
        1,
        Math.trunc(finiteNumber(source.throttle.proposalDedupeWindowHours, fallback.throttle.proposalDedupeWindowHours)),
      ),
      autoExecutionCooldownHours: Math.max(1, Math.trunc(finiteNumber(source.throttle.autoExecutionCooldownHours, fallback.throttle.autoExecutionCooldownHours))),
      allowRiskReductionOverride: source.throttle.allowRiskReductionOverride !== false,
      allowSevereRiskOverride: source.throttle.allowSevereRiskOverride !== false,
      minScoreToBreakCooldown: Math.max(0, Math.min(100, finiteNumber(source.throttle.minScoreToBreakCooldown, fallback.throttle.minScoreToBreakCooldown))),
    },
    actionScore: {
      proposalThreshold: Math.max(0, Math.min(100, finiteNumber(source.actionScore.proposalThreshold, fallback.actionScore.proposalThreshold))),
      autoExecuteThreshold: Math.max(0, Math.min(100, finiteNumber(source.actionScore.autoExecuteThreshold, fallback.actionScore.autoExecuteThreshold))),
    },
    execution: {
      autoGenerateEnabled: source.execution.autoGenerateEnabled !== false,
      autoExecuteEnabled: source.execution.autoExecuteEnabled === true,
      maxSingleOrderPctOfNav: Math.max(
        0.01,
        Math.min(0.5, finiteNumber(source.execution.maxSingleOrderPctOfNav, fallback.execution.maxSingleOrderPctOfNav)),
      ),
    },
  };
}
