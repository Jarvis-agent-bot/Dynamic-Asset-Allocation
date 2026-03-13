import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateExecutionRisk } from "@/src/daa/modules/workbench/workbenchExecutionService";

import { getDaaSystemConfig, saveDaaSystemConfig, upsertDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntime() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

describe("workbench-manual-risk-check-v1", () => {
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
            cash: 10000,
            frozenCash: 0,
            investableCash: 10000,
          },
          targetWeights: {},
        },
      },
    });
  });

  it("手动买入不应被其他观察资产的超限目标权重阻断", async () => {
    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      watchEnabled: true,
      targetWeightHint: 0.0843,
      lastPrice: 100,
    });
    await upsertDaaAssetUniverseRow({
      symbol: "BND",
      market: "US",
      currency: "USD",
      assetClass: "BOND",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "ETF",
      marketGroup: "US_BOND",
      watchEnabled: true,
      targetWeightHint: 0.6537,
      lastPrice: 100,
    });

    const riskCheck = await validateExecutionRisk({
      manualProposal: {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        currency: "USD",
        side: "BUY",
        suggestedQty: 1,
        suggestedNotional: 100,
        price: 100,
        reason: "manual_preview_test",
      },
    });

    expect(riskCheck.overallStatus).not.toBe("block");
    const maxPositionItem = riskCheck.items.find((item) => item.rule === "max_position");
    expect(maxPositionItem?.status).toBe("pass");
    expect(maxPositionItem?.message).toContain("AAPL");
    expect(riskCheck.items.some((item) => item.message.includes("BND 目标权重"))).toBe(false);
  });


  it("零权益时手动预览的仓位和交易占比应回落到 100% 口径", async () => {
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
            cash: 0,
            frozenCash: 0,
            investableCash: 0,
          },
          targetWeights: {},
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      watchEnabled: true,
      targetWeightHint: 0,
      lastPrice: 100,
    });

    const riskCheck = await validateExecutionRisk({
      manualProposal: {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        currency: "USD",
        side: "BUY",
        suggestedQty: 1,
        suggestedNotional: 100,
        price: 100,
        reason: "manual_zero_equity_preview_test",
      },
    });

    const maxPositionItem = riskCheck.items.find((item) => item.rule === "max_position");
    const maxOrderItem = riskCheck.items.find((item) => item.rule === "max_order_pct");

    expect(maxPositionItem?.current).toBeCloseTo(100, 6);
    expect(maxPositionItem?.message).toContain("100.00%");
    expect(maxOrderItem?.current).toBeCloseTo(100, 6);
    expect(maxOrderItem?.message).toContain("100.00%");
  });
});
