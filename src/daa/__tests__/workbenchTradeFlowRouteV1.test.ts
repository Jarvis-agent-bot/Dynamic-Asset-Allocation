import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

import { GET as getWorkbenchBootstrap } from "@/app/api/daa/workbench/bootstrap/route";
import { POST as upsertAsset } from "@/app/api/daa/workbench/assets/upsert/route";
import { POST as executeOrder } from "@/app/api/daa/workbench/execution/execute/route";
import { POST as previewExecution } from "@/app/api/daa/workbench/execution/preview/route";
import { getDaaSystemConfigV2, saveDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

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

    const expectedCash = 10000 - Number(previewJson.data.notionalInBase) - Number(previewJson.data.fee);
    expect(Number(bootstrapJson.data.account.cash)).toBeCloseTo(expectedCash, 6);
    expect(bootstrapJson.data.execution.logs.some((item: { status: string }) => item.status === "executed")).toBe(true);
  });
});
