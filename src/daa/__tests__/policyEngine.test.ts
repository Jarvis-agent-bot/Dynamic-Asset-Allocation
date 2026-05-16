import { describe, expect, it } from "vitest";

import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import { evaluatePortfolioPolicy } from "@/src/daa/modules/policy-engine/policyEngine";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { evaluateNoTradeBand } from "@/src/daa/modules/policy-engine/noTradeBand";
import type { InvestmentIntent } from "@/src/daa/modules/intents/intentTypes";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";
import type { DriftSignal } from "@/src/daa/modules/signals/signalTypes";
import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";

function portfolioState(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    asOf: "2026-05-09T00:00:00.000Z",
    accountId: "default",
    baseCurrency: "USD",
    navBase: 10_000,
    cashBase: 1_000,
    positions: [],
    exposures: {
      holdingCount: 1,
      maxWeightPct: 45,
      maxAbsDriftPct: 10,
      investedValueBase: 9_000,
    },
    dataHealth: {
      status: "ok",
      staleAssetKeys: [],
      missingAssetKeys: [],
      fxMissingAssetKeys: [],
      message: null,
    },
    ...overrides,
  };
}

function driftSignal(absDriftPct: number): DriftSignal {
  return {
    signalId: `drift:US::QQQ:${absDriftPct}`,
    type: "drift",
    source: "test",
    severity: absDriftPct >= 5 ? "warn" : "info",
    asOf: "2026-05-09T00:00:00.000Z",
    evidence: [],
    assetKey: "US::QQQ",
    symbol: "QQQ",
    actualWeightPct: 40 + absDriftPct,
    targetWeightPct: 40,
    driftPct: absDriftPct,
    absDriftPct,
    volatilityAdjustedDrift: absDriftPct / 5,
    enteredOuterBand: absDriftPct >= 5,
    exitedInnerBand: absDriftPct <= 2,
  };
}

function driftIntent(): InvestmentIntent {
  return {
    intentId: "intent:drift:test",
    source: "drift",
    action: "hold",
    assetKeys: ["US::QQQ"],
    thesis: "drift entered outer band",
    confidencePct: 70,
    expiresAt: null,
    evidenceRefs: ["drift:US::QQQ"],
  };
}

function agentIntent(): InvestmentIntent {
  return {
    intentId: "intent:agent:test",
    source: "agent_thesis",
    action: "review_only",
    assetKeys: ["US::QQQ"],
    thesis: "Agent 目标权重计划进入策略评估",
    confidencePct: 80,
    expiresAt: null,
    evidenceRefs: [],
  };
}

function proposal(): RebalanceProposal {
  return {
    assetKey: "US::QQQ",
    symbol: "QQQ",
    currency: "USD",
    fxRateToBase: 1,
    side: "SELL",
    suggestedQty: 1,
    suggestedNotional: 100,
    price: 100,
    reason: "reduce drift",
    selected: true,
    hfContribution: null,
    proposalType: "drift",
  };
}

describe("policy-engine", () => {
  it("把 policy 参数归一化为策略引擎语义", () => {
    const config = normalizeSystemConfig({
      policy: {
        drift: { outerBandPct: 0.07 },
        review: { frequency: "weekly", dayOfMonth: 5, scheduledTimeUtc: "10:00" },
        throttle: { proposalDedupeWindowHours: 168, autoExecutionCooldownHours: 12 },
      },
    });
    const policy = resolvePolicyConfig(config);

    expect(policy.drift.outerBandPct).toBe(0.07);
    expect(policy.review.frequency).toBe("weekly");
    expect(policy.review.scheduledTimeUtc).toBe("10:00");
    expect(policy.throttle.proposalDedupeWindowHours).toBe(168);
    expect(policy.throttle.autoExecutionCooldownHours).toBe(12);
  });

  it("保留显式 0 值，不再被默认值覆盖", () => {
    const config = normalizeSystemConfig({
      policy: {
        drift: { minNotionalBase: 0 },
        actionScore: { proposalThreshold: 0, autoExecuteThreshold: 0 },
      },
    });
    const policy = resolvePolicyConfig(config);

    expect(policy.drift.minNotionalBase).toBe(0);
    expect(policy.actionScore.proposalThreshold).toBe(0);
    expect(policy.actionScore.autoExecuteThreshold).toBe(0);
  });

  it("no-trade band 在内圈、外圈和冷静期之间给出稳定状态", () => {
    const policy = resolvePolicyConfig(normalizeSystemConfig({}));

    expect(evaluateNoTradeBand({ driftSignals: [driftSignal(1.5)], policy }).state).toBe("inside");
    expect(evaluateNoTradeBand({ driftSignals: [driftSignal(6)], policy }).state).toBe("entered_outer");
    expect(evaluateNoTradeBand({ driftSignals: [driftSignal(6)], policy, hasRecentProposal: true }).state).toBe("cooling");
  });

  it("自动 drift 未进入行动外圈时只观察，不生成建议", () => {
    const policy = resolvePolicyConfig(normalizeSystemConfig({}));
    const decision = evaluatePortfolioPolicy({
      portfolioState: portfolioState(),
      policy,
      signals: [driftSignal(3)],
      intents: [],
      proposals: [],
      triggerSource: "drift",
      manual: false,
    });

    expect(decision.action).toBe("observe");
    expect(decision.blockers.join(" ")).toContain("尚未进入行动外圈");
  });

  it("自动执行冷静期内可以生成建议，但不会授权自动执行", () => {
    const policy = resolvePolicyConfig(normalizeSystemConfig({}));
    const decision = evaluatePortfolioPolicy({
      portfolioState: portfolioState(),
      policy,
      signals: [driftSignal(10)],
      intents: [driftIntent()],
      proposals: [proposal()],
      triggerSource: "drift",
      manual: false,
      latestAutoComparableCycle: {
        cycleId: "recent-cycle",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
    });

    expect(decision.action).toBe("propose");
    expect(decision.reasons.join(" ")).toContain("自动执行冷静期");
  });

  it("Agent 目标权重计划有可执行提案时直接授权自动执行", () => {
    const policy = resolvePolicyConfig(normalizeSystemConfig({}));
    const decision = evaluatePortfolioPolicy({
      portfolioState: portfolioState({
        dataHealth: {
          status: "stale",
          staleAssetKeys: ["US::QQQ"],
          missingAssetKeys: [],
          fxMissingAssetKeys: [],
          message: "测试 stale 数据不再阻断 Agent 全自动目标权重计划",
        },
      }),
      policy,
      signals: [],
      intents: [agentIntent()],
      proposals: [{
        ...proposal(),
        side: "BUY",
        proposalType: "drift",
      }],
      triggerSource: "agent_trigger",
      manual: false,
      latestAutoComparableCycle: {
        cycleId: "recent-cycle",
        createdAt: new Date().toISOString(),
      },
    });

    expect(decision.action).toBe("authorize_auto_execute");
    expect(decision.blockers).toEqual([]);
    expect(decision.reasons.join(" ")).toContain("Agent 目标权重计划");
  });
});
