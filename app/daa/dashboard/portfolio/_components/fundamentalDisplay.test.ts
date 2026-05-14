import { describe, expect, it } from "vitest";

import { buildAssetUniverseView } from "@/src/daa/__tests__/testDataFactories";
import { deriveGrowthRequirementBadge, deriveValuationBadge } from "./fundamentalDisplay";
import type { AssetFundamentals, FundamentalHistoryStats } from "@/app/daa/dashboard/_hooks/useFundamentals";

function history(overrides: Partial<FundamentalHistoryStats> = {}): FundamentalHistoryStats {
  return {
    sampleCount: 6,
    minSampleCount: 36,
    spanDays: 701,
    minSpanDays: 720,
    percentile: null,
    latestRank: 6,
    latestValue: 2.49,
    min: 0.94,
    median: 1.74,
    max: 2.49,
    firstAsOfDate: "2024-06-07",
    latestAsOfDate: "2026-05-08",
    eligible: false,
    reason: "insufficient_sample_count:6/36",
    ...overrides,
  };
}

function fundamentals(overrides: Partial<AssetFundamentals> = {}): AssetFundamentals {
  return {
    symbol: "1810.HK",
    normalizedSymbol: "1810.HK",
    marketCap: 818_120_586_222,
    marketCapCurrency: "HKD",
    marketCapSource: "price_x_shares_outstanding",
    marketPrice: 32.7,
    marketPriceCurrency: "HKD",
    sharesOutstanding: 25_019_000_000,
    sharesSource: "shares_outstanding",
    trailingPE: 17.66,
    pbRatio: 3.1,
    dividendYieldPct: null,
    revenueGrowthPct: 25,
    earningsGrowthPct: null,
    grossMarginsPct: 22,
    operatingMarginsPct: null,
    profitMarginsPct: 8,
    totalRevenue: null,
    freeCashflow: null,
    operatingCashflow: null,
    totalCash: null,
    totalDebt: null,
    enterpriseValue: null,
    pePercentile: null,
    peSampleCount: 6,
    peAsOfDate: "2026-05-08",
    peHistory: history({ latestValue: 17.66 }),
    marketCapAsOfDate: "2026-05-08",
    source: "yfinance_fundamentals_timeseries_quote_summary",
    updatedAt: "2026-05-14T00:00:00.000Z",
    issues: [],
    ...overrides,
  };
}

describe("deriveValuationBadge", () => {
  it("低样本 PE 不再按历史分位判断，改用绝对阈值", () => {
    const row = buildAssetUniverseView({
      assetKey: "HK::1810",
      symbol: "1810.HK",
      market: "HK",
      assetClass: "EQUITY",
      instrumentType: "STOCK",
    });

    const badge = deriveValuationBadge(row, fundamentals());

    expect(badge.label).toBe("合理");
    expect(badge.reason).toContain("历史样本不足");
    expect(badge.description).toContain("样本 6/36");
    expect(badge.description).not.toContain("自身历史 100%");
    expect(badge.reason).not.toContain("PEG");
  });

  it("用 PE 和 Yahoo 增长字段给出增长兑现要求标签", () => {
    const row = buildAssetUniverseView({
      assetKey: "HK::1810",
      symbol: "1810.HK",
      market: "HK",
      assetClass: "EQUITY",
      instrumentType: "STOCK",
    });

    const badge = deriveGrowthRequirementBadge(row, fundamentals());

    expect(badge.label).toBe("要求较低");
    expect(badge.reason).toContain("PE 17.66");
    expect(badge.reason).toContain("收入增速 25.0%");
  });
});
