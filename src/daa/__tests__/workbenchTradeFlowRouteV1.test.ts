import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

import { GET as getWorkbenchBootstrap } from "@/app/api/daa/workbench/bootstrap/route";
import { POST as upsertAsset } from "@/app/api/daa/workbench/assets/upsert/route";
import { POST as executeOrder } from "@/app/api/daa/workbench/execution/execute/route";
import { POST as previewExecution } from "@/app/api/daa/workbench/execution/preview/route";
import { getDaaSystemConfigV2, listDaaCashLedgerEntriesV1, saveDaaSystemConfigV2, upsertDaaFxRatesV1 } from "@/src/daa/store/daaStorePgV1";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntimeV1() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

describe("workbench-trade-flow-route-v1", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetPgMemRuntimeV1();

    const current = await getDaaSystemConfigV2();
    await saveDaaSystemConfigV2({
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

  it("搜索新增资产 -> 市价预览 -> 直接执行 -> 持仓与现金更新", async () => {
    const upsertResponse = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
        watchEnabled: true,
        lastPrice: 100,
      }),
    }));
    const upsertJson = await upsertResponse.json();

    expect(upsertResponse.status).toBe(200);
    expect(upsertJson.ok).toBe(true);
    expect(upsertJson.data.row.assetKey).toBe("US::AAPL");

    const previewResponse = await previewExecution(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "BUY",
        qty: 2,
      }),
    }));
    const previewJson = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(previewJson.ok).toBe(true);
    expect(previewJson.data.canSubmit).toBe(true);

    const executeResponse = await executeOrder(new Request("http://localhost/api/daa/workbench/execution/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        side: previewJson.data.side,
        assetKey: previewJson.data.assetKey,
        symbol: previewJson.data.symbol,
        market: previewJson.data.market,
        currency: previewJson.data.currency,
        qty: previewJson.data.qty,
        price: previewJson.data.price,
        fee: previewJson.data.fee,
        pricingMode: "market",
        priceSource: previewJson.data.priceSource,
        priceSnapshotAt: previewJson.data.priceSnapshotAt,
        reasonText: "集成链路测试",
      }),
    }));
    const executeJson = await executeResponse.json();

    expect(executeResponse.status).toBe(200);
    expect(executeJson.ok).toBe(true);
    expect(executeJson.data.item.pricingMode).toBe("market");
    expect(executeJson.data.summary.executed).toBe(1);
    expect(executeJson.data.summary.rejected).toBe(0);

    const bootstrapResponse = await getWorkbenchBootstrap(new Request("http://localhost/api/daa/workbench/bootstrap"));
    const bootstrapJson = await bootstrapResponse.json();

    expect(bootstrapResponse.status).toBe(200);
    expect(bootstrapJson.ok).toBe(true);

    const assetRow = bootstrapJson.data.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(assetRow).toBeTruthy();
    expect(Number(assetRow.holdingQty)).toBeCloseTo(2, 6);
    const initialTotalCost = Number(previewJson.data.qty) * Number(previewJson.data.price);
    expect(Number(assetRow.costBasis)).toBeCloseTo(initialTotalCost, 6);

    const expectedCash = 10000 - Number(previewJson.data.notionalInBase) - Number(previewJson.data.fee);
    expect(Number(bootstrapJson.data.account.cash)).toBeCloseTo(expectedCash, 6);
    expect(bootstrapJson.data.execution.logs.some((item: { status: string }) => item.status === "executed")).toBe(true);

    const cashLedger = await listDaaCashLedgerEntriesV1(10);
    expect(cashLedger).toHaveLength(1);
    expect(cashLedger[0]).toMatchObject({
      side: "withdraw",
      entryKind: "trade_execution",
      baseCurrency: "USD",
      accountBaseCurrency: "USD",
      ticketId: executeJson.data.item.ticketId,
      cycleId: null,
    });
    expect(Number(cashLedger[0].amountInAccountBase)).toBeCloseTo(Number(previewJson.data.notionalInBase) + Number(previewJson.data.fee), 6);
    expect(Number(cashLedger[0].fxRateToAccount)).toBeCloseTo(1, 6);

    const sellPreviewResponse = await previewExecution(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "SELL",
        qty: 1,
      }),
    }));
    const sellPreviewJson = await sellPreviewResponse.json();

    expect(sellPreviewResponse.status).toBe(200);
    expect(sellPreviewJson.ok).toBe(true);
    expect(sellPreviewJson.data.canSubmit).toBe(true);

    const sellExecuteResponse = await executeOrder(new Request("http://localhost/api/daa/workbench/execution/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        side: sellPreviewJson.data.side,
        assetKey: sellPreviewJson.data.assetKey,
        symbol: sellPreviewJson.data.symbol,
        market: sellPreviewJson.data.market,
        currency: sellPreviewJson.data.currency,
        qty: sellPreviewJson.data.qty,
        price: sellPreviewJson.data.price,
        fee: sellPreviewJson.data.fee,
        pricingMode: "market",
        priceSource: sellPreviewJson.data.priceSource,
        priceSnapshotAt: sellPreviewJson.data.priceSnapshotAt,
        reasonText: "部分卖出回归测试",
      }),
    }));
    const sellExecuteJson = await sellExecuteResponse.json();

    expect(sellExecuteResponse.status).toBe(200);
    expect(sellExecuteJson.ok).toBe(true);
    expect(sellExecuteJson.data.summary.executed).toBe(1);
    expect(sellExecuteJson.data.summary.rejected).toBe(0);

    const bootstrapAfterSellResponse = await getWorkbenchBootstrap(new Request("http://localhost/api/daa/workbench/bootstrap"));
    const bootstrapAfterSellJson = await bootstrapAfterSellResponse.json();

    expect(bootstrapAfterSellResponse.status).toBe(200);
    expect(bootstrapAfterSellJson.ok).toBe(true);

    const assetRowAfterSell = bootstrapAfterSellJson.data.assetUniverse.find((item: { assetKey: string }) => item.assetKey === "US::AAPL");
    expect(assetRowAfterSell).toBeTruthy();
    expect(Number(assetRowAfterSell.holdingQty)).toBeCloseTo(1, 6);
    expect(Number(assetRowAfterSell.costBasis)).toBeCloseTo(initialTotalCost / 2, 6);

    const cashLedgerAfterSell = await listDaaCashLedgerEntriesV1(10);
    expect(cashLedgerAfterSell).toHaveLength(2);
    expect(cashLedgerAfterSell[0]).toMatchObject({
      side: "deposit",
      entryKind: "trade_execution",
      baseCurrency: "USD",
      accountBaseCurrency: "USD",
      ticketId: sellExecuteJson.data.item.ticketId,
      cycleId: null,
    });
  }, 15000);

  it("冻结现金不应被手工预览与执行链路透支", async () => {
    const current = await getDaaSystemConfigV2();
    await saveDaaSystemConfigV2({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 1000,
            frozenCash: 800,
            investableCash: 200,
          },
          targetWeights: {},
        },
        dataSources: {
          ...current.config.dataSources,
          priceFeed: {
            ...current.config.dataSources.priceFeed,
            enabled: false,
          },
        },
      },
    });

    const upsertResponse = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        region: "US",
        exchange: "NASDAQ",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
        watchEnabled: true,
        lastPrice: 100,
      }),
    }));
    expect(upsertResponse.status).toBe(200);

    const previewResponse = await previewExecution(new Request("http://localhost/api/daa/workbench/execution/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetKey: "US::AAPL",
        side: "BUY",
        qty: 3,
      }),
    }));
    const previewJson = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(previewJson.ok).toBe(true);
    expect(previewJson.data.canSubmit).toBe(false);
    expect(previewJson.data.warnings.some((item: string) => item.includes("可投资现金不足"))).toBe(true);

    const executeResponse = await executeOrder(new Request("http://localhost/api/daa/workbench/execution/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        side: "BUY",
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        qty: 3,
        price: 100,
        fee: 0,
        pricingMode: "manual",
        reasonText: "冻结现金保护测试",
      }),
    }));
    const executeJson = await executeResponse.json();

    expect(executeResponse.status).toBe(409);
    expect(executeJson.ok).toBe(false);
    expect(executeJson.error.details.code).toBe("INSUFFICIENT_INVESTABLE_CASH");

    const bootstrapResponse = await getWorkbenchBootstrap(new Request("http://localhost/api/daa/workbench/bootstrap"));
    const bootstrapJson = await bootstrapResponse.json();
    expect(bootstrapResponse.status).toBe(200);
    expect(bootstrapJson.data.account.cash).toBeCloseTo(1000, 6);
    expect(bootstrapJson.data.account.investableCash).toBeCloseTo(200, 6);
    expect(bootstrapJson.data.account.frozenCash).toBeCloseTo(800, 6);
    expect(bootstrapJson.data.assetUniverse.every((item: { holdingQty: number }) => Number(item.holdingQty) === 0)).toBe(true);
  });

  it("直接执行外币订单时会按服务端 FX 换算基准币风控金额", async () => {
    const current = await getDaaSystemConfigV2();
    await saveDaaSystemConfigV2({
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
          constraints: {
            ...current.config.strategy.constraints,
            maxOrderPctOfNav: 0.2,
          },
          targetWeights: {},
        },
      },
    });

    await upsertDaaFxRatesV1([{
      baseCcy: "HKD",
      quoteCcy: "USD",
      rate: 0.15,
      source: "test",
      asOfTs: "2026-03-08T00:00:00.000Z",
    }]);

    const upsertResponse = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "0700.HK",
        market: "HK",
        currency: "HKD",
        assetClass: "EQUITY",
        region: "HK",
        exchange: "HKEX",
        instrumentType: "STOCK",
        marketGroup: "HK_EQUITY",
        watchEnabled: true,
        lastPrice: 100,
      }),
    }));
    expect(upsertResponse.status).toBe(200);

    const executeResponse = await executeOrder(new Request("http://localhost/api/daa/workbench/execution/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        side: "BUY",
        assetKey: "HK::0700.HK",
        symbol: "0700.HK",
        market: "HK",
        currency: "HKD",
        qty: 100,
        price: 100,
        fee: 0,
        pricingMode: "market",
        reasonText: "外币风控换算测试",
      }),
    }));
    const executeJson = await executeResponse.json();

    expect(executeResponse.status).toBe(200);
    expect(executeJson.ok).toBe(true);
    expect(executeJson.data.summary.executed).toBe(1);

    const bootstrapResponse = await getWorkbenchBootstrap(new Request("http://localhost/api/daa/workbench/bootstrap"));
    const bootstrapJson = await bootstrapResponse.json();

    expect(bootstrapResponse.status).toBe(200);
    expect(Number(bootstrapJson.data.account.cash)).toBeCloseTo(8500, 6);

    const cashLedger = await listDaaCashLedgerEntriesV1(10);
    expect(cashLedger).toHaveLength(1);
    expect(Number(cashLedger[0].amountInAccountBase)).toBeCloseTo(1500, 6);
    expect(Number(cashLedger[0].fxRateToAccount)).toBeCloseTo(1, 6);
  });

});
