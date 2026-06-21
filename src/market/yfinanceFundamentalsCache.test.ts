import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaaStoreFundamentalSnapshot } from "@/src/daa/store/daaStorePg";
import type { YfinanceFundamentalSnapshot } from "@/src/market/yfinanceFundamentals";

const snapshotFixture: YfinanceFundamentalSnapshot = {
  symbol: "AAPL",
  normalizedSymbol: "AAPL",
  marketCap: 3_000_000_000_000,
  marketCapCurrency: "USD",
  marketCapSource: "quote_summary_market_cap",
  marketPrice: 210,
  marketPriceCurrency: "USD",
  sharesOutstanding: 14_000_000_000,
  sharesSource: "shares_outstanding",
  trailingPE: 28.5,
  pbRatio: 42.1,
  dividendYieldPct: 0.48,
  revenueGrowthPct: 4.2,
  earningsGrowthPct: 5.1,
  grossMarginsPct: 46.2,
  operatingMarginsPct: 31.4,
  profitMarginsPct: 24.1,
  totalRevenue: 390_000_000_000,
  freeCashflow: 95_000_000_000,
  operatingCashflow: 112_000_000_000,
  totalCash: 70_000_000_000,
  totalDebt: 108_000_000_000,
  enterpriseValue: 3_050_000_000_000,
  debtToEquity: 167.3,
  trailingEps: 6.42,
  netIncome: 94_000_000_000,
  sector: "Technology",
  sectorKey: "technology",
  industry: "Consumer Electronics",
  industryKey: "consumer-electronics",
  pePercentile: 72,
  peSampleCount: 120,
  peAsOfDate: "2026-06-20",
  peHistory: {
    sampleCount: 120,
    minSampleCount: 36,
    spanDays: 900,
    minSpanDays: 720,
    percentile: 72,
    latestRank: 86,
    latestValue: 28.5,
    min: 12,
    median: 23,
    max: 41,
    firstAsOfDate: "2023-12-01",
    latestAsOfDate: "2026-06-20",
    eligible: true,
    reason: null,
  },
  peerGroupKey: "industry:consumer-electronics",
  peerGroupLabel: "Consumer Electronics",
  peerGroupBasis: "industry",
  peerSymbols: ["MSFT", "GOOGL"],
  peerMinSampleCount: 20,
  peerReason: null,
  pePeerPercentile: 65,
  pePeerSampleCount: 25,
  pePeerMedian: 24,
  pbPeerPercentile: 80,
  pbPeerSampleCount: 24,
  pbPeerMedian: 8,
  marketCapAsOfDate: null,
  source: "yfinance_fundamentals_timeseries_quote_summary",
  updatedAt: "2026-06-21T00:00:00.000Z",
  issues: [],
};

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaExternalPayloadRaw: vi.fn(async () => ({ id: "raw_fundamentals_1" })),
  getLatestDaaExternalPayloadRaw: vi.fn(async () => null),
  getLatestDaaFundamentalSnapshot: vi.fn(async () => null),
  upsertDaaFundamentalSnapshots: vi.fn(async () => []),
}));

vi.mock("@/src/market/yfinanceFundamentals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/market/yfinanceFundamentals")>();
  return {
    ...actual,
    fetchYfinanceFundamentals: vi.fn(async () => snapshotFixture),
  };
});

import {
  appendDaaExternalPayloadRaw,
  getLatestDaaExternalPayloadRaw,
  getLatestDaaFundamentalSnapshot,
  upsertDaaFundamentalSnapshots,
} from "@/src/daa/store/daaStorePg";
import { fetchYfinanceFundamentals } from "@/src/market/yfinanceFundamentals";
import { fetchYfinanceFundamentalsCached } from "@/src/market/yfinanceFundamentalsCache";

describe("yfinance-fundamentals-cache-v1", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T00:00:00.000Z"));
    vi.clearAllMocks();
    vi.mocked(getLatestDaaExternalPayloadRaw).mockResolvedValue(null);
    vi.mocked(getLatestDaaFundamentalSnapshot).mockResolvedValue(null);
    vi.mocked(appendDaaExternalPayloadRaw).mockResolvedValue({ id: "raw_fundamentals_1" } as never);
    vi.mocked(upsertDaaFundamentalSnapshots).mockResolvedValue([]);
    vi.mocked(fetchYfinanceFundamentals).mockResolvedValue(snapshotFixture);
  });

  it("优先从结构化 fundamentals 快照读取缓存，不再把 raw payload 当业务缓存", async () => {
    const cachedSnapshot: DaaStoreFundamentalSnapshot = {
      provider: "yfinance",
      normalizedSymbol: "AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      marketCap: 3_000_000_000_000,
      trailingPE: 28.5,
      pbRatio: 42.1,
      debtToEquity: 167.3,
      freeCashflow: 95_000_000_000,
      totalRevenue: 390_000_000_000,
      netIncome: 94_000_000_000,
      trailingEps: 6.42,
      snapshotJson: snapshotFixture,
      fetchedAt: "2026-06-21T00:00:00.000Z",
      expireAt: "2026-06-22T00:00:00.000Z",
      rawRefId: "raw_fundamentals_1",
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
    vi.mocked(getLatestDaaFundamentalSnapshot).mockResolvedValue(cachedSnapshot);

    const result = await fetchYfinanceFundamentalsCached("AAPL", {
      now: new Date("2026-06-21T00:10:00.000Z"),
    });

    expect(result.cacheStatus).toBe("hit");
    expect(result.snapshot.trailingPE).toBe(28.5);
    expect(vi.mocked(getLatestDaaFundamentalSnapshot)).toHaveBeenCalledWith({
      provider: "yfinance",
      normalizedSymbol: "AAPL",
      freshOnly: true,
      nowIso: "2026-06-21T00:10:00.000Z",
    });
    expect(vi.mocked(getLatestDaaExternalPayloadRaw)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchYfinanceFundamentals)).not.toHaveBeenCalled();
  });

  it("刷新成功后写入结构化 fundamentals 快照，并只把 raw payload 作为短期审计材料", async () => {
    const result = await fetchYfinanceFundamentalsCached("AAPL", {
      forceRefresh: true,
      now: new Date("2026-06-21T00:00:00.000Z"),
    });

    expect(result.cacheStatus).toBe("miss");
    expect(vi.mocked(appendDaaExternalPayloadRaw)).toHaveBeenCalledWith(expect.objectContaining({
      provider: "yfinance",
      resource: "fundamentals_yahoo_valuation_v4",
      subjectKey: "AAPL",
      expireAt: "2026-07-21T00:00:00.000Z",
    }));
    expect(vi.mocked(upsertDaaFundamentalSnapshots)).toHaveBeenCalledWith([expect.objectContaining({
      provider: "yfinance",
      symbol: "AAPL",
      normalizedSymbol: "AAPL",
      snapshotJson: snapshotFixture,
      fetchedAt: "2026-06-21T00:00:00.000Z",
      expireAt: "2026-06-22T00:00:00.000Z",
      rawRefId: "raw_fundamentals_1",
    })]);
  });
});
