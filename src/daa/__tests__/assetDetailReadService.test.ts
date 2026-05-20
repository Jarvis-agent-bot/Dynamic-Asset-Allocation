import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAssetUniverseView,
  buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture,
} from "@/src/daa/__tests__/testDataFactories";
import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";

const mocks = vi.hoisted(() => ({
  buildWorkbenchBootstrap: vi.fn(),
  getDaaAccountScopeId: vi.fn(() => "default"),
  getDaaLedgerStartTs: vi.fn(),
  listDaaTradeTickets: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: mocks.buildWorkbenchBootstrap,
}));

vi.mock("@/src/daa/account/accountScope", () => ({
  getDaaAccountScopeId: mocks.getDaaAccountScopeId,
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaLedgerStartTs: mocks.getDaaLedgerStartTs,
  listDaaTradeTickets: mocks.listDaaTradeTickets,
}));

import { buildAssetDetailReadModel } from "@/src/daa/modules/read/assetDetailReadService";
import { clearReadModelMemoryCache } from "@/src/daa/modules/read/readModelMemoryCache";

function buildTradeTicketFixture(overrides?: Partial<TradeTicket>): TradeTicket {
  return {
    ticketId: "ticket-1",
    basketId: "basket-1",
    assetKey: "KR::000660.KS",
    cycleId: null,
    source: "manual",
    status: "executed",
    symbol: "000660.KS",
    market: "KR",
    instrumentCurrency: "KRW",
    baseCurrency: "USD",
    side: "BUY",
    qty: 2,
    price: 100000,
    fee: 0,
    grossNotional: 200000,
    fxRateToBase: 0.0007,
    notionalInBase: 140,
    decisionRefId: null,
    reasonTags: [],
    reasonText: null,
    snapshotBefore: {},
    snapshotAfter: null,
    rejectCode: null,
    rejectMessage: null,
    pricingMode: "market",
    priceSource: null,
    priceSnapshotAt: null,
    brokerKind: null,
    brokerAccountId: null,
    brokerOrderId: null,
    brokerStatus: null,
    filledQty: 2,
    avgFillPrice: 100000,
    lastBrokerSyncAt: null,
    lastAppliedFillQty: 2,
    brokerRejectReason: null,
    brokerRaw: null,
    createdBy: "test",
    createdAt: "2026-03-02T00:00:00.000Z",
    executedAt: "2026-03-02T00:30:00.000Z",
    canceledAt: null,
    updatedAt: "2026-03-02T00:30:00.000Z",
    ...overrides,
  };
}

describe("asset-detail-read-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReadModelMemoryCache();
    mocks.getDaaAccountScopeId.mockReturnValue("default");
    mocks.getDaaLedgerStartTs.mockResolvedValue("2026-03-01T00:00:00.000Z");
    mocks.buildWorkbenchBootstrap.mockResolvedValue(buildWorkbenchBootstrapFixture({
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "KR::000660.KS",
          symbol: "000660.KS",
          market: "KR",
          currency: "KRW",
          yfinanceSymbol: "000660.KS",
          holdingQty: 1,
          lastPrice: 100000,
        }),
      ],
    }));
    mocks.listDaaTradeTickets.mockResolvedValue([
      buildTradeTicketFixture(),
      buildTradeTicketFixture({
        ticketId: "ticket-old",
        createdAt: "2026-02-20T00:00:00.000Z",
        executedAt: "2026-02-20T00:30:00.000Z",
      }),
      buildTradeTicketFixture({
        ticketId: "ticket-open",
        executedAt: null,
      }),
    ]);
  });

  it("只返回目标资产和当前账本内已成交交易标记", async () => {
    const result = await buildAssetDetailReadModel({
      assetKey: "kr::000660.ks",
      fresh: true,
    });

    expect(mocks.buildWorkbenchBootstrap).toHaveBeenCalledWith({
      syncPrices: false,
      autoRiskCycle: false,
    });
    expect(mocks.listDaaTradeTickets).toHaveBeenCalledWith({
      symbol: "000660.KS",
      limit: 80,
    });
    expect(result.row?.assetKey).toBe("KR::000660.KS");
    expect(result.tradeMarkers).toEqual([
      {
        date: "2026-03-02",
        side: "BUY",
        qty: 2,
        price: 100000,
      },
    ]);
  });
});
