import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

import { POST as runStrategyLabWriteback } from "@/app/api/daa/strategy-lab/writeback/route";
import { POST as upsertAsset } from "@/app/api/daa/workbench/assets/upsert/route";
import { getDaaSystemConfig, saveDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { runStrategyLab } from "@/src/daa/modules/strategyLab/strategyLabService";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntime() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as Record<string, unknown>)[PG_GLOBAL_KEY];
  delete (globalThis as Record<string, unknown>)[STORE_GLOBAL_KEY];
}

function createMarketDataClient(seriesMap: Record<string, Array<{ date: string; close: number }>>) {
  return {
    yfinance: {
      async priceSeriesBars(params: { symbol: string }) {
        const rows = seriesMap[params.symbol];
        if (!rows) throw new Error(`missing symbol ${params.symbol}`);
        return rows;
      },
    },
  } as any;
}

describe("strategy-lab-cross-market-flow-v1", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetPgMemRuntime();

    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 100000,
            frozenCash: 0,
            investableCash: 100000,
            totalEquity: 100000,
          },
          targetWeights: {
            "US::AAPL": 0.5,
            "US::BND": 0.5,
          },
        },
      },
    });
  });

  it("支持加 HK/CN 资产 -> 跨币种回测 -> 写回当前配置", async () => {
    const assetsToAdd = [
      {
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
        watchEnabled: true,
        targetWeightHint: 0.35,
        lastPrice: 100,
      },
      {
        symbol: "BND",
        market: "US",
        currency: "USD",
        assetClass: "BOND",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "ETF",
        marketGroup: "US_ETF",
        watchEnabled: true,
        targetWeightHint: 0.25,
        lastPrice: 80,
      },
      {
        symbol: "0700.HK",
        market: "HK",
        currency: "HKD",
        assetClass: "EQUITY",
        region: "HK",
        exchange: "HKEX",
        instrumentType: "STOCK",
        marketGroup: "HK_EQUITY",
        watchEnabled: true,
        targetWeightHint: 0.2,
        lastPrice: 780,
      },
      {
        symbol: "600519.SS",
        market: "CN",
        currency: "CNY",
        assetClass: "EQUITY",
        region: "CN",
        exchange: "SSE",
        instrumentType: "STOCK",
        marketGroup: "CN_EQUITY",
        watchEnabled: true,
        targetWeightHint: 0.2,
        lastPrice: 1500,
      },
    ];

    for (const asset of assetsToAdd) {
      const response = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(asset),
      }));
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
    }

    const bootstrapBefore = await buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: false });
    const researchAssets = bootstrapBefore.assetUniverse.filter((row) => row.watchEnabled);

    expect(researchAssets.map((row) => row.assetKey)).toEqual(expect.arrayContaining(["US::AAPL", "HK::0700.HK", "CN::600519.SS"]));

    const marketDataClient = createMarketDataClient({
      AAPL: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 103 },
        { date: "2025-01-03", close: 104 },
        { date: "2025-01-06", close: 106 },
      ],
      BND: [
        { date: "2025-01-01", close: 80 },
        { date: "2025-01-02", close: 80.2 },
        { date: "2025-01-03", close: 80.5 },
        { date: "2025-01-06", close: 80.8 },
      ],
      "0700.HK": [
        { date: "2025-01-01", close: 780 },
        { date: "2025-01-02", close: 790 },
        { date: "2025-01-03", close: 800 },
        { date: "2025-01-06", close: 808 },
      ],
      "600519.SS": [
        { date: "2025-01-01", close: 1500 },
        { date: "2025-01-02", close: 1495 },
        { date: "2025-01-03", close: 1515 },
        { date: "2025-01-06", close: 1530 },
      ],
      "HKDUSD=X": [
        { date: "2025-01-01", close: 0.128 },
        { date: "2025-01-02", close: 0.128 },
        { date: "2025-01-03", close: 0.128 },
        { date: "2025-01-06", close: 0.128 },
      ],
      "CNYUSD=X": [
        { date: "2025-01-01", close: 0.138 },
        { date: "2025-01-02", close: 0.138 },
        { date: "2025-01-03", close: 0.138 },
        { date: "2025-01-06", close: 0.138 },
      ],
      SPY: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 101 },
        { date: "2025-01-03", close: 102 },
        { date: "2025-01-06", close: 103 },
      ],
    });

    const result = await runStrategyLab({
      assets: researchAssets.map((row) => ({
        assetKey: row.assetKey,
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
        yfinanceSymbol: row.yfinanceSymbol,
        currentTargetWeightPct: row.targetWeightPct,
        currentWeightPct: row.actualWeightPct,
        holdingQty: row.holdingQty,
        watchEnabled: row.watchEnabled,
      })),
      startDate: "2025-01-01",
      endDate: "2025-01-06",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 100000,
      constraints: { maxPositionPct: 1, maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
      execution: { timing: "t_plus_1_close", feeRateBps: 0, slippageBps: 0 },
    }, { marketDataClient });

    expect(result.baseCurrency).toBe("USD");
    expect(result.assetsUsed.map((item) => item.assetKey)).toEqual(expect.arrayContaining(["HK::0700.HK", "CN::600519.SS"]));

    const ensemble = result.candidates.find((item) => item.id === "ensemble");
    expect(ensemble).toBeTruthy();
    expect(Object.keys(ensemble?.targetWeights || {})).not.toHaveLength(0);

    const writebackResponse = await runStrategyLabWriteback(new Request("http://localhost/api/daa/strategy-lab/writeback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidateId: "ensemble",
        scopeAssetKeys: researchAssets.map((row) => row.assetKey),
        weightsByAssetKey: ensemble?.targetWeights || {},
      }),
    }));
    const writebackJson = await writebackResponse.json();

    expect(writebackResponse.status).toBe(200);
    expect(writebackJson.ok).toBe(true);
    expect(writebackJson.data.updatedCount).toBeGreaterThan(0);

    const bootstrapAfter = await buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: false });
    const afterByKey = new Map(bootstrapAfter.assetUniverse.map((row) => [row.assetKey, row]));

    for (const [assetKey, weight] of Object.entries(ensemble?.targetWeights || {})) {
      expect(afterByKey.get(assetKey)?.targetWeightPct || 0).toBeCloseTo(weight * 100, 6);
    }

    const nextConfig = await getDaaSystemConfig();
    expect(nextConfig.config.strategy.targetWeights).toEqual({});
  }, 15000);
});
