import { describe, expect, it } from "vitest";
import { buildDailyReviewText } from "@/src/daa/notify/dailyReviewBuilder";
import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

function makeBootstrap(overrides?: Partial<WorkbenchBootstrap>): WorkbenchBootstrap {
  return {
    baseCurrency: "USD",
    account: {
      cash: 3200,
      investableCash: 3000,
      frozenCash: 0,
      totalEquity: 52300,
    },
    assetUniverse: [
      {
        assetKey: "US::AAPL", symbol: "AAPL", market: "US", currency: "USD",
        assetClass: "equity", region: "US", exchange: "NASDAQ", instrumentType: "stock",
        marketGroup: "US", yfinanceSymbol: "AAPL",
        holdingQty: 10, holdingPrice: 170, costBasis: 1700, holdingTags: [],
        watchEnabled: true, targetWeightHint: 0.15, watchTags: [], notes: null,
        lastPrice: 183.6, priceUpdatedAt: "2026-03-17T00:00:00Z", priceStatus: "fresh",
        priceSource: "yfinance", priceAgeSec: 100,
        valuationBase: 1836, fxRateToBase: 1, fxMissing: false,
        actualWeightPct: 3.5, targetWeightPct: 15, gapPct: 3.2,
        hfSignal: null,
      },
      {
        assetKey: "US::BND", symbol: "BND", market: "US", currency: "USD",
        assetClass: "bond", region: "US", exchange: "NYSE", instrumentType: "etf",
        marketGroup: "US", yfinanceSymbol: "BND",
        holdingQty: 50, holdingPrice: 74, costBasis: 3700, holdingTags: [],
        watchEnabled: true, targetWeightHint: 0.2, watchTags: [], notes: null,
        lastPrice: 73.78, priceUpdatedAt: "2026-03-17T00:00:00Z", priceStatus: "fresh",
        priceSource: "yfinance", priceAgeSec: 100,
        valuationBase: 3689, fxRateToBase: 1, fxMissing: false,
        actualWeightPct: 7, targetWeightPct: 20, gapPct: -0.3,
        hfSignal: null,
      },
    ],
    execution: { logs: [] },
    rebalance: { mode: "manual", autoGenerateEnabled: false, scheduledTimeUtc: "00:20", timezone: "Asia/Shanghai" },
    policy: {
      enabled: true,
      shadowMode: false,
      drift: { enabled: true, mode: "static_band", outerBandPct: 0.05, innerBandPct: 0.02, minNotionalBase: 200, volatilityLookbackDays: 60 },
      review: { enabled: true, frequency: "monthly", dayOfMonth: 1, scheduledTimeUtc: "00:20", timezone: "Asia/Shanghai" },
      throttle: { proposalDedupeWindowHours: 24, autoExecutionCooldownHours: 72, allowRiskReductionOverride: true, allowSevereRiskOverride: true, minScoreToBreakCooldown: 85 },
      actionScore: { proposalThreshold: 25, autoExecuteThreshold: 70 },
      execution: { autoGenerateEnabled: false, autoExecuteEnabled: false, maxSingleOrderPctOfNav: 0.1 },
    },
    latestCycle: null,
    marketContext: {
      generatedAt: "2026-03-17T01:00:00Z",
      regime: "risk_on",
      riskOffScorePct: 20,
      confidencePct: 80,
      buyScale: 1,
      highRiskBuyScale: 1,
      reasons: [],
      indicators: [
        { key: "vix", scope: "us", label: "VIX", rawValue: 14.2, weight: 0.55, signal: "risk_on", updatedAt: "2026-03-17T01:00:00Z" },
      ],
      scopes: [
        { scope: "us", label: "美股", generatedAt: "2026-03-17T01:00:00Z", regime: "risk_on", riskOffScorePct: 15, confidencePct: 85, buyScale: 1, highRiskBuyScale: 1, reasons: [], indicators: [] },
        { scope: "hk_cn", label: "港中", generatedAt: "2026-03-17T01:00:00Z", regime: "transitional", riskOffScorePct: 40, confidencePct: 60, buyScale: 0.85, highRiskBuyScale: 0.7, reasons: [], indicators: [] },
      ],
    },
    warnings: [],
    ...overrides,
  } as WorkbenchBootstrap;
}

describe("buildDailyReviewText", () => {
  it("generates report with all sections", async () => {
    const text = await buildDailyReviewText(makeBootstrap());

    expect(text).toContain("每日复核");
    expect(text).toContain("组合概览");
    expect(text).toContain("2个标的");
    expect(text).toContain("买入/加仓");
    expect(text).toContain("VIX");
    expect(text).toContain("AAPL");
    expect(text).toContain("偏移监控");
    expect(text).toContain("仅供参考");
  });

  it("handles null marketContext", async () => {
    const text = await buildDailyReviewText(makeBootstrap({ marketContext: null }));

    expect(text).toContain("每日复核");
    expect(text).not.toContain("市场环境");
    expect(text).toContain("仅供参考");
  });

  it("handles empty assetUniverse", async () => {
    const text = await buildDailyReviewText(makeBootstrap({ assetUniverse: [] }));

    expect(text).toContain("0个标的");
    expect(text).not.toContain("偏移监控");
  });

  it("includes review reminder when scheduled review is enabled", async () => {
    const text = await buildDailyReviewText(makeBootstrap());

    // every_3_days 频率显示"自动复盘"而非"下次日期"
    expect(text).toContain("提醒");
  });
});
