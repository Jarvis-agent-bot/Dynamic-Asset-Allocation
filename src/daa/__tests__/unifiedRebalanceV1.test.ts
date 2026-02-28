import { describe, expect, it } from "vitest";

import { buildDaaUnifiedPlanV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

function baseRequest(): DaaUnifiedRequestV1 {
  return {
    account: { cash: 2000 },
    constraints: {
      minNotional: 100,
      maxOrderPctOfNav: 0.1,
      maxOrderPctOfLiquidity: 0.15,
    },
    policy: {
      baseDriftTriggerPct: 0.05,
      strongTrendDriftTriggerPct: 0.1,
      valueTrapThesisDriftPct: 0.12,
      sbIsolationScorePct: 0.35,
      riskOffConsensusPct: 0.6,
      riskOffScalePct: 0.7,
    },
    targetWeights: {
      AAA: 0.6,
      BBB: 0.4,
    },
    positions: [
      { symbol: "AAA", qty: 5, price: 100, tags: ["high"], liquidityNotional24h: 5000 },
      { symbol: "BBB", qty: 20, price: 100, tags: ["low", "bond"], liquidityNotional24h: 200000 },
    ],
    analysts: [
      {
        analystId: "a1",
        accuracyPct: 85,
        riskControlPct: 80,
        disciplinePct: 90,
        transparencyPct: 85,
        stance: "offensive",
        styleCluster: "trend",
      },
      {
        analystId: "a2",
        accuracyPct: 70,
        riskControlPct: 65,
        disciplinePct: 75,
        transparencyPct: 70,
        stance: "defensive",
        styleCluster: "macro",
      },
    ],
    assetViews: [
      { symbol: "AAA", analystId: "a1", convictionPct: 80, thesisDriftPct: 3, momentumRegime: "strong" },
      { symbol: "BBB", analystId: "a2", convictionPct: 70, thesisDriftPct: 2, momentumRegime: "neutral" },
    ],
  };
}

describe("unified-rebalance-v1", () => {
  it("强势+高分资产会提升触发阈值到 strong 配置", () => {
    const result = buildDaaUnifiedPlanV1(baseRequest());
    expect(result.summary.triggerThresholdPct).toBe(0.1);
  });

  it("sb 标签资产会进入隔离舱并被降权至 0", () => {
    const req = baseRequest();
    req.positions[0]!.tags = ["high", "sb"];

    const result = buildDaaUnifiedPlanV1(req);
    expect(result.layers.guardrail.isolatedSymbols).toContain("AAA");
    expect(result.layers.strategy.adjustedTargetWeights.AAA ?? 0).toBe(0);
  });

  it("订单应同时受 NAV 与流动性上限约束", () => {
    const req = baseRequest();
    req.account = { cash: 12000 };
    req.positions = [{ symbol: "AAA", qty: 0, price: 100, tags: ["high"], liquidityNotional24h: 3000 }];
    req.targetWeights = { AAA: 1 };
    req.assetViews = [{ symbol: "AAA", analystId: "a1", convictionPct: 90, thesisDriftPct: 1, momentumRegime: "strong" }];

    const result = buildDaaUnifiedPlanV1(req);
    const buy = result.executableOrders.find((x) => x.symbol === "AAA" && x.side === "BUY");

    expect(buy).toBeTruthy();
    expect(buy!.notional).toBeCloseTo(450, 6);
    expect(buy!.cappedBy).toContain("流动性 15%");
  });
});
