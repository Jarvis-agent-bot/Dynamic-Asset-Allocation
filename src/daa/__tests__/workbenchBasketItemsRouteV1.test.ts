import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  createDaaTradeTicketV1: vi.fn(),
  getActiveDaaTradeBasketV1: vi.fn(),
  listDaaTradeTicketsV1: vi.fn(),
}));

import { POST } from "@/app/api/daa/workbench/execution/items/route";
import { createDaaTradeTicketV1, getActiveDaaTradeBasketV1, listDaaTradeTicketsV1 } from "@/src/daa/store/daaStorePgV1";

describe("workbench-execution-items-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createDaaTradeTicketV1).mockResolvedValue({
      ticketId: "ticket_1",
      basketId: "basket_1",
      assetKey: "US::AAPL",
      source: "manual",
      status: "ready",
      symbol: "AAPL",
      market: "US",
      instrumentCurrency: "USD",
      baseCurrency: "USD",
      side: "BUY",
      qty: 2,
      price: 180,
      fee: 0.5,
      grossNotional: 360,
      fxRateToBase: 1,
      notionalInBase: 360,
      decisionRefId: null,
      reasonTags: [],
      reasonText: "",
      snapshotBefore: {},
      snapshotAfter: null,
      rejectCode: null,
      rejectMessage: null,
      pricingMode: "market",
      priceSource: "yfinance:AAPL",
      priceSnapshotAt: "2026-03-01T00:00:00.000Z",
      createdBy: "admin",
      createdAt: "2026-03-01T00:00:00.000Z",
      executedAt: null,
      canceledAt: null,
      updatedAt: "2026-03-01T00:00:00.000Z",
    } as any);

    vi.mocked(getActiveDaaTradeBasketV1).mockResolvedValue({
      basketId: "basket_1",
      source: "manual",
      status: "draft",
      decisionRefId: null,
      createdBy: "admin",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      executedAt: null,
    } as any);

    vi.mocked(listDaaTradeTicketsV1).mockResolvedValue([{
      ticketId: "ticket_1",
      basketId: "basket_1",
      assetKey: "US::AAPL",
      source: "manual",
      status: "ready",
      symbol: "AAPL",
      market: "US",
      instrumentCurrency: "USD",
      baseCurrency: "USD",
      side: "BUY",
      qty: 2,
      price: 180,
      fee: 0.5,
      grossNotional: 360,
      fxRateToBase: 1,
      notionalInBase: 360,
      decisionRefId: null,
      reasonTags: [],
      reasonText: "",
      snapshotBefore: {},
      snapshotAfter: null,
      rejectCode: null,
      rejectMessage: null,
      pricingMode: "market",
      priceSource: "yfinance:AAPL",
      priceSnapshotAt: "2026-03-01T00:00:00.000Z",
      createdBy: "admin",
      createdAt: "2026-03-01T00:00:00.000Z",
      executedAt: null,
      canceledAt: null,
      updatedAt: "2026-03-01T00:00:00.000Z",
    } as any]);
  });

  it("支持 market 模式票据字段透传", async () => {
    const response = await POST(
      new Request("http://localhost/api/daa/workbench/execution/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          side: "BUY",
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          qty: 2,
          price: 180,
          fee: 0.5,
          pricingMode: "market",
          priceSource: "yfinance:AAPL",
          priceSnapshotAt: "2026-03-01T00:00:00.000Z",
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(vi.mocked(createDaaTradeTicketV1)).toHaveBeenCalledWith(expect.objectContaining({
      pricingMode: "market",
      priceSource: "yfinance:AAPL",
      priceSnapshotAt: "2026-03-01T00:00:00.000Z",
    }));
    expect(json.data.queueItems.length).toBe(1);
  });

  it("非法 qty 返回 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/daa/workbench/execution/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          side: "BUY",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          qty: 0,
          price: 180,
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });
});
