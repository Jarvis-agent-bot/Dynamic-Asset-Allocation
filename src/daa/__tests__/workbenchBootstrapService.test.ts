import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaTriggerEvent: vi.fn(async () => null),
  appendDaaRunHistory: vi.fn(async () => null),
  appendAssetPriceHistoryRows: vi.fn(async () => 0),
  createDaaRebalanceCycle: vi.fn(),
  createDaaRebalanceDecision: vi.fn(),
  createDaaTradeTicket: vi.fn(),
  executeDaaTradeTickets: vi.fn(),
  getDaaAccountState: vi.fn(),
  getDaaCycleReport: vi.fn(),
  getDaaHumanIngestState: vi.fn(async () => null),
  getDaaLedgerStartTs: vi.fn(async () => null),
  getDaaRebalanceCycle: vi.fn(),
  getDaaSystemConfig: vi.fn(),
  getDaaMarketCacheHealthStats: vi.fn(async () => ({ freshCount: 1, staleCount: 0, missingCount: 0, errorCount: 0, unsupportedCount: 0, totalSnapshots: 1, recentJobSuccessRatePct: 100, recentJobFailureRatePct: 0, provider: "yfinance" })),
  listDaaAssetUniverse: vi.fn(),
  listDaaCycleReports: vi.fn(),
  listDaaEquitySnapshots: vi.fn(async () => []),
  listDaaFxRates: vi.fn(async () => []),
  listDaaRebalanceCycles: vi.fn(async () => []),
  listDaaTradeTickets: vi.fn(async () => []),
  patchDaaRebalanceCycle: vi.fn(),
  upsertDaaCycleReport: vi.fn(),
  updateDaaAssetUniverseLastPrice: vi.fn(),
}));

vi.mock("@/src/daa/modules/decision/hydrateUnifiedRequest", () => ({
  hydrateUnifiedRequestWithSignals: vi.fn(),
}));

vi.mock("@/src/daa/llm/llmAnalysis", () => ({
  runLlmAnalysis: vi.fn(),
}));

vi.mock("@/src/daa/unifiedRebalance", () => ({
  buildDaaUnifiedPlan: vi.fn(),
}));

vi.mock("@/src/daa/modules/portfolio/portfolioValuation", () => ({
  buildFxLookupToBase: vi.fn(() => new Map()),
  summarizeMarkToMarketPortfolio: vi.fn(() => ({ rows: [], holdingsValue: 0, totalEquity: 1000 })),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheService", () => ({
  getMarketPricesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/assetUniverseService", () => ({
  buildAssetUniverseViewRows: vi.fn(),
}));

import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { buildAssetUniverseViewRows } from "@/src/daa/modules/workbench/assetUniverseService";
import { getDaaAccountState, getDaaMarketCacheHealthStats, getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";

describe("workbench-bootstrap-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getDaaSystemConfig).mockResolvedValue({
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
        },
      },
    } as any);
    vi.mocked(getDaaAccountState).mockResolvedValue({
      baseCurrency: "USD",
      cash: 1000,
      frozenCash: 0,
      investableCash: 1000,
      totalEquity: 1000,
      updatedAt: "2026-03-06T14:00:00.000Z",
    } as any);

    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
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

    vi.mocked(buildAssetUniverseViewRows).mockImplementation((input: any) => ([
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
    vi.mocked(getMarketPricesWithCache).mockResolvedValue({
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

    const result = await buildWorkbenchBootstrap({ syncPrices: false });
    const row = result.assetUniverse[0];

    expect(vi.mocked(getMarketPricesWithCache)).toHaveBeenCalledWith(expect.objectContaining({
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
    vi.mocked(getMarketPricesWithCache).mockRejectedValue(new Error("cache unavailable"));
    vi.mocked(getDaaMarketCacheHealthStats).mockResolvedValue({
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

    const result = await buildWorkbenchBootstrap({ syncPrices: false });

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
