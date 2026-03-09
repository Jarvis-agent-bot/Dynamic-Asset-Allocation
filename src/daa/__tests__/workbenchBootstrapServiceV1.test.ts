import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  appendDaaTriggerEventV1: vi.fn(async () => null),
  appendDaaRunHistoryV1: vi.fn(async () => null),
  appendPriceHistoryRowsV1: vi.fn(async () => 0),
  createDaaRebalanceCycleV1: vi.fn(),
  createDaaRebalanceDecisionV1: vi.fn(),
  createDaaTradeTicketV1: vi.fn(),
  executeDaaTradeTicketsV1: vi.fn(),
  getDaaCycleReportV1: vi.fn(),
  getDaaHumanIngestStateV1: vi.fn(async () => null),
  getDaaRebalanceCycleV1: vi.fn(),
  getDaaSystemConfigV2: vi.fn(),
  getDaaMarketCacheHealthStatsV1: vi.fn(async () => ({ freshCount: 1, staleCount: 0, missingCount: 0, errorCount: 0, unsupportedCount: 0, totalSnapshots: 1, recentJobSuccessRatePct: 100, recentJobFailureRatePct: 0, provider: "yfinance" })),
  listDaaAssetUniverseV1: vi.fn(),
  listDaaCycleReportsV1: vi.fn(),
  listDaaEquitySnapshotsV1: vi.fn(async () => []),
  listDaaFxRatesV1: vi.fn(async () => []),
  listDaaRebalanceCyclesV1: vi.fn(async () => []),
  listDaaTradeTicketsV1: vi.fn(async () => []),
  patchDaaRebalanceCycleV1: vi.fn(),
  upsertDaaCycleReportV1: vi.fn(),
  updateDaaAssetUniverseLastPriceV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/decision/hydrateUnifiedRequestV1", () => ({
  hydrateUnifiedRequestWithSignalsV1: vi.fn(),
}));

vi.mock("@/src/daa/llm/llmAnalysisV1", () => ({
  runLlmAnalysisV1: vi.fn(),
}));

vi.mock("@/src/daa/unifiedRebalanceV1", () => ({
  buildDaaUnifiedPlanV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/portfolio/portfolioValuationV1", () => ({
  buildFxLookupToBaseV1: vi.fn(() => new Map()),
  summarizeMarkToMarketPortfolioV1: vi.fn(() => ({ rows: [], holdingsValue: 0, totalEquity: 1000 })),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheServiceV1", () => ({
  getMarketPricesWithCacheV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/assetUniverseServiceV1", () => ({
  buildAssetUniverseViewRowsV1: vi.fn(),
}));

import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { buildAssetUniverseViewRowsV1 } from "@/src/daa/modules/workbench/assetUniverseServiceV1";
import { getDaaMarketCacheHealthStatsV1, getDaaSystemConfigV2, listDaaAssetUniverseV1 } from "@/src/daa/store/daaStorePgV1";

describe("workbench-bootstrap-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
      config: {
        dataSources: {
          priceFeed: {
            marketCache: {
              freshMinutes: 15,
              serveStaleHours: 48,
              rawRetentionDays: 90,
            },
          },
        },
        strategy: {
          account: {
            baseCurrency: "USD",
            cash: 1000,
            investableCash: 1000,
            frozenCash: 0,
            totalEquity: 1000,
          },
          targetWeights: {},
          constraints: {
            maxPositionPct: 0.3,
            maxOrderPctOfNav: 0.1,
          },
          risk: {
            perAssetStopLossPct: 0.1,
            perAssetTakeProfitPct: 0.2,
            maxConcentrationPct: 0.4,
          },
        },
        rebalanceStrategy: {
          calendar: { enabled: false, frequency: "monthly", dayOfMonth: 1 },
          drift: { enabled: true, thresholdPct: 0.05 },
          cooldownHours: 24,
          analysisTimeUtc: "00:20",
          timezone: "Asia/Shanghai",
          analysisFocus: "mock",
          autoGenerateEnabled: false,
          notifyEmailTo: "",
        },
      },
    } as any);

    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        holdingQty: 0,
        holdingPrice: 0,
        lastPrice: 188.2,
        watchEnabled: true,
        targetWeightHint: 5,
      },
    ] as any);

    vi.mocked(buildAssetUniverseViewRowsV1).mockImplementation((input: any) => ([
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        instrumentType: "STOCK",
        holdingQty: 0,
        holdingPrice: 0,
        costBasis: 0,
        lastPrice: input?.rows?.[0]?.lastPrice ?? 188.2,
        fxRateToBase: 1,
        fxMissing: false,
        valuationBase: null,
        actualWeightPct: 0,
        targetWeightPct: 5,
        gapPct: 5,
        watchEnabled: true,
        targetWeightHint: 5,
        priceStatus: "stale",
        priceUpdatedAt: input?.rows?.[0]?.priceUpdatedAt ?? "2026-03-06T08:05:00.000Z",
        priceSource: "asset_universe",
        priceAgeSec: 7 * 60 * 60,
        yfinanceSymbol: "AAPL",
        hfSignal: null,
      },
    ] as any));
  });

  it("总览行只保留单一行情更新时间语义", async () => {
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 191.2,
        priceStatus: "fresh",
        priceUpdatedAt: "2026-03-06T14:00:00.000Z",
        priceAgeSec: 12,
        priceSource: "workbench_bootstrap_context:yfinance:AAPL",
      },
    });

    const result = await buildWorkbenchBootstrapV1({ syncPrices: false });
    const row = result.assetUniverse[0];

    expect(vi.mocked(getMarketPricesWithCacheV1)).toHaveBeenCalledWith(expect.objectContaining({
      allowRefresh: false,
      source: "workbench_bootstrap_context",
      assets: [{ symbol: "AAPL", market: "US", currency: "USD" }],
    }));
    expect(row.lastPrice).toBe(191.2);
    expect(row.priceStatus).toBe("fresh");
    expect(row.priceUpdatedAt).toBe("2026-03-06T14:00:00.000Z");
    expect(row.priceSource).toBe("workbench_bootstrap_context:yfinance:AAPL");
    expect(row.priceAgeSec).toBe(12);
    expect(row).not.toHaveProperty("priceFetchedAt");
    expect(row).not.toHaveProperty("priceAsOf");
    expect(result.warnings).not.toContain("存在 1 个资产行情抓取时间超过 6 小时。");
  });


  it("market cache 读取失败时返回降级 health 与 warning", async () => {
    vi.mocked(getMarketPricesWithCacheV1).mockRejectedValue(new Error("cache unavailable"));
    vi.mocked(getDaaMarketCacheHealthStatsV1).mockResolvedValue({
      provider: "yfinance",
      totalSnapshots: 10,
      freshCount: 1,
      staleCount: 6,
      missingCount: 3,
      errorCount: 0,
      unsupportedCount: 0,
      recentJobSuccessRatePct: 40,
      recentJobFailureRatePct: 60,
    });

    const result = await buildWorkbenchBootstrapV1({ syncPrices: false });

    expect(result.marketDataHealth).toMatchObject({
      status: "down",
      freshCount: 1,
      staleCount: 6,
      missingCount: 3,
      recentJobFailureRatePct: 60,
    });
    expect(result.warnings.some((item) => item.includes("市场缓存读取失败"))).toBe(true);
    expect(result.marketDataHealth?.message).toContain("回退到本地快照");
  });
});
