import { describe, expect, it } from "vitest";

import { buildDaaUnifiedPlanV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

function baseRequest(): DaaUnifiedRequestV1 {
  return {
    account: { cash: 2000 },
    constraints: {
      minNotional: 100,
      maxOrderPctOfNav: 0.1,
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
      "US::AAA": 0.6,
      "US::BBB": 0.4,
    },
    positions: [
      { symbol: "AAA", qty: 5, price: 100, tags: ["high"] },
      { symbol: "BBB", qty: 20, price: 100, tags: ["low", "bond"] },
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

  it("订单应受 NAV 上限约束", () => {
    const req = baseRequest();
    req.account = { cash: 12000 };
    req.positions = [{ symbol: "AAA", qty: 0, price: 100, tags: ["high"] }];
    req.targetWeights = { "US::AAA": 1 };
    req.assetViews = [{ symbol: "AAA", analystId: "a1", convictionPct: 90, thesisDriftPct: 1, momentumRegime: "strong" }];

    const result = buildDaaUnifiedPlanV1(req);
    const buy = result.executableOrders.find((x) => x.symbol === "AAA" && x.side === "BUY");

    expect(buy).toBeTruthy();
    expect(buy!.notional).toBeCloseTo(1200, 6);
    expect(buy!.cappedBy).toContain("NAV 10%");
  });

  it("支持使用外部人因信号驱动 tier 与阈值判断", () => {
    const req = baseRequest();
    req.analysts = [];
    req.assetViews = [];
    req.humanSignals = [
      {
        symbol: "AAA",
        aggregatedScorePct: 86,
        convictionPct: 82,
        thesisDriftPct: 4,
        confidencePct: 88,
        momentumRegime: "strong",
        stance: "offensive",
      },
    ];

    const result = buildDaaUnifiedPlanV1(req);
    const aaa = result.layers.humanFactor.assetDecisions.find((x) => x.symbol === "AAA");

    expect(aaa).toBeTruthy();
    expect(aaa!.tier).toBe("elite");
    expect(result.summary.triggerThresholdPct).toBe(0.1);
  });

  it("investableCash=0 且存在可用现金时，默认按 cash-frozen 参与下单", () => {
    const req = baseRequest();
    req.account = {
      baseCurrency: "USD",
      cash: 1000,
      investableCash: 0,
      frozenCash: 100,
    };
    req.targetWeights = { "US::AAA": 1 };
    req.positions = [{ symbol: "AAA", qty: 0, price: 100, tags: ["mid"] }];
    req.analysts = [];
    req.assetViews = [];

    const result = buildDaaUnifiedPlanV1(req);
    const buy = result.executableOrders.find((item) => item.symbol === "AAA" && item.side === "BUY");

    expect(buy).toBeTruthy();
    expect(buy!.notional).toBeGreaterThan(0);
  });

  it("跨币种场景会先把成本价换算到基准币，再计算止损告警", () => {
    const req = baseRequest();
    req.account = {
      baseCurrency: "CNY",
      cash: 0,
    };
    req.risk = {
      maxDrawdownPct: 0.5,
      perAssetStopLossPct: 0.05,
      maxConcentrationPct: 1,
      correlationCapPct: 1,
      maxTotalRiskExposurePct: 1,
    };
    req.targetWeights = { "US::USX": 1 };
    req.positions = [
      {
        symbol: "USX",
        market: "US",
        currency: "USD",
        qty: 1,
        price: 100,
        costBasis: 110,
        tags: ["mid"],
      },
    ];
    req.fxRates = [
      {
        baseCcy: "USD",
        quoteCcy: "CNY",
        rate: 7,
        source: "test",
        asOfTs: new Date().toISOString(),
      },
    ];
    req.analysts = [];
    req.assetViews = [];

    const result = buildDaaUnifiedPlanV1(req);

    expect(result.warnings.some((item) => item.includes("触发止损线"))).toBe(true);
  });

  it("跨币种 FX 过期时会阻断非基准币种 BUY 订单", () => {
    const req = baseRequest();
    req.account = {
      baseCurrency: "USD",
      cash: 1200,
      investableCash: 1200,
    };
    req.targetWeights = { "HK::0700.HK": 1 };
    req.positions = [
      {
        symbol: "0700.HK",
        market: "HK",
        currency: "HKD",
        qty: 0,
        price: 300,
        tags: ["mid"],
      },
    ];
    req.fxRates = [
      {
        baseCcy: "USD",
        quoteCcy: "HKD",
        rate: 7.8,
        source: "test",
        asOfTs: "2024-01-01T00:00:00.000Z",
      },
    ];
    req.analysts = [];
    req.assetViews = [];

    const result = buildDaaUnifiedPlanV1(req);
    const blocked = result.blockedOrders.find((item) => item.symbol === "0700.HK" && item.side === "BUY");

    expect(blocked?.blockedBy).toBe("fx_guardrail");
  });

  it("symbol 级 targetWeights 会抛错（必须使用 assetKey）", () => {
    const req = baseRequest();
    req.targetWeights = { AAA: 1 };

    expect(() => buildDaaUnifiedPlanV1(req)).toThrow(/MARKET::SYMBOL/);
  });
});
