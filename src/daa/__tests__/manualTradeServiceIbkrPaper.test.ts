import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/workbench/workbenchExecutionService", () => ({
  normalizeReasonTags: vi.fn((value) => Array.isArray(value) ? value : []),
  normalizeTradeSide: vi.fn((value) => String(value || "").toUpperCase() === "SELL" ? "SELL" : (String(value || "").toUpperCase() === "BUY" ? "BUY" : null)),
  validateExecutionRisk: vi.fn(async () => ({
    overallStatus: "pass",
    items: [],
  })),
}));

vi.mock("@/src/daa/broker", () => ({
  resolveExecutionRoute: vi.fn(),
  syncBrokerOrders: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  applyDaaBrokerOrderSync: vi.fn(),
  createDaaTradeTicket: vi.fn(),
  executeDaaTradeTickets: vi.fn(),
  getDaaSystemConfig: vi.fn(),
  listDaaAssetUniverse: vi.fn(),
  listDaaFxRates: vi.fn(),
  listDaaTradeTickets: vi.fn(),
  updateDaaAssetUniverseLastPrice: vi.fn(),
}));

import { executeManualTrade } from "@/src/daa/modules/workbench/manualTradeService";
import {
  applyDaaBrokerOrderSync,
  createDaaTradeTicket,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
  listDaaTradeTickets,
} from "@/src/daa/store/daaStorePg";
import { resolveExecutionRoute, syncBrokerOrders } from "@/src/daa/broker";

describe("manual-trade-service-ibkr-paper-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getDaaSystemConfig).mockResolvedValue({
      config: {
        strategy: {
          account: {
            baseCurrency: "USD",
            cash: 10000,
            frozenCash: 0,
            investableCash: 10000,
          },
        },
      },
    } as any);
    vi.mocked(listDaaFxRates).mockResolvedValue([
      { baseCcy: "USD", quoteCcy: "USD", rate: 1 },
    ] as any);
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "EQUITY",
        instrumentType: "STOCK",
        marketGroup: "US_EQUITY",
      },
    ] as any);
    vi.mocked(createDaaTradeTicket).mockResolvedValue({
      ticketId: "ticket-local-1",
      basketId: "basket-1",
      assetKey: "US::AAPL",
      cycleId: null,
      source: "manual",
      status: "ready",
      symbol: "AAPL",
      market: "US",
      instrumentCurrency: "USD",
      baseCurrency: "USD",
      side: "BUY",
      qty: 1,
      price: 100,
      fee: 0,
      grossNotional: 100,
      fxRateToBase: 1,
      notionalInBase: 100,
      decisionRefId: null,
      reasonTags: [],
      reasonText: null,
      snapshotBefore: {},
      snapshotAfter: null,
      rejectCode: null,
      rejectMessage: null,
      pricingMode: "market",
      priceSource: "manual",
      priceSnapshotAt: null,
      brokerKind: "ibkr_paper",
      brokerAccountId: null,
      brokerOrderId: null,
      brokerStatus: null,
      filledQty: null,
      avgFillPrice: null,
      lastBrokerSyncAt: null,
      lastAppliedFillQty: 0,
      brokerRejectReason: null,
      brokerRaw: null,
      createdBy: "admin",
      createdAt: "2026-03-19T10:00:00.000Z",
      executedAt: null,
      canceledAt: null,
      updatedAt: "2026-03-19T10:00:00.000Z",
    } as any);
    vi.mocked(applyDaaBrokerOrderSync).mockResolvedValue({
      ticketId: "ticket-local-1",
      basketId: "basket-1",
      assetKey: "US::AAPL",
      cycleId: null,
      source: "manual",
      status: "submitted",
      symbol: "AAPL",
      market: "US",
      instrumentCurrency: "USD",
      baseCurrency: "USD",
      side: "BUY",
      qty: 1,
      price: 100,
      fee: 0,
      grossNotional: 100,
      fxRateToBase: 1,
      notionalInBase: 100,
      decisionRefId: null,
      reasonTags: [],
      reasonText: null,
      snapshotBefore: {},
      snapshotAfter: null,
      rejectCode: null,
      rejectMessage: null,
      pricingMode: "market",
      priceSource: "manual",
      priceSnapshotAt: null,
      brokerKind: "ibkr_paper",
      brokerAccountId: "DU123456",
      brokerOrderId: "817231",
      brokerStatus: "Submitted",
      filledQty: null,
      avgFillPrice: null,
      lastBrokerSyncAt: "2026-03-19T10:01:00.000Z",
      lastAppliedFillQty: 0,
      brokerRejectReason: null,
      brokerRaw: {},
      createdBy: "admin",
      createdAt: "2026-03-19T10:00:00.000Z",
      executedAt: null,
      canceledAt: null,
      updatedAt: "2026-03-19T10:01:00.000Z",
    } as any);
    vi.mocked(syncBrokerOrders).mockResolvedValue({
      kind: "ibkr_paper",
      scope: "ticket",
      orderCount: 1,
      updatedCount: 1,
      positionCount: 0,
      tickets: [],
    } as any);
    vi.mocked(listDaaTradeTickets).mockResolvedValue([
      {
        ticketId: "ticket-local-1",
        status: "submitted",
      },
    ] as any);
    vi.mocked(resolveExecutionRoute).mockResolvedValue({
      kind: "ibkr_paper",
      remote: true,
      routeReason: "股票 / ETF / 债券 / 商品资产优先走 IBKR 模拟盘。",
      adapter: {
        kind: "ibkr_paper",
        remote: true,
        placeOrder: vi.fn(async () => ({
          accepted: true,
          order: {
            accountId: "DU123456",
            orderId: "817231",
            status: "Submitted",
            filledQty: null,
            avgFillPrice: null,
            updatedAt: "2026-03-19T10:01:00.000Z",
            raw: {},
          },
          messages: [],
          warnings: [],
        })),
      },
    } as any);
  });

  it("ibkr_paper 下单会返回 submitted 而不是伪造 executed", async () => {
    const result = await executeManualTrade({
      source: "manual",
      side: "BUY",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      qty: 1,
      price: 100,
      fee: 0,
      pricingMode: "market",
    });

    expect(result.result.status).toBe("submitted");
    expect(result.item.status).toBe("submitted");
    expect(result.summary.executed).toBe(0);
    expect(result.summary.rejected).toBe(0);
    expect(vi.mocked(createDaaTradeTicket)).toHaveBeenCalled();
    expect(vi.mocked(applyDaaBrokerOrderSync)).toHaveBeenCalled();
    expect(vi.mocked(syncBrokerOrders)).toHaveBeenCalledWith({
      scope: "ticket",
      ticketId: "ticket-local-1",
      limit: 50,
    });
    expect(vi.mocked(resolveExecutionRoute)).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: "US::AAPL",
      assetClass: "EQUITY",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
    }));
  });
});
