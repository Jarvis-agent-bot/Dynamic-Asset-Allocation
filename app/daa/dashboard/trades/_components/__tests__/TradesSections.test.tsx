// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TradesModel } from "@/app/daa/dashboard/_hooks/useTradesModel";
import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";
import { TradesTabsPanel } from "../TradesSections";

function buildTradeTicketFixture(
  overrides?: Partial<TradeTicket>,
): TradeTicket {
  return {
    ticketId: "ticket-1",
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
    pricingMode: "manual",
    priceSource: null,
    priceSnapshotAt: null,
    brokerKind: null,
    brokerAccountId: null,
    brokerOrderId: null,
    brokerStatus: null,
    filledQty: null,
    avgFillPrice: null,
    lastBrokerSyncAt: null,
    lastAppliedFillQty: 0,
    brokerRejectReason: null,
    brokerRaw: null,
    createdBy: "test",
    createdAt: "2026-03-19T10:00:00.000Z",
    executedAt: null,
    canceledAt: null,
    updatedAt: "2026-03-19T10:00:00.000Z",
    ...overrides,
  };
}

function createTradesModel(overrides: Partial<TradesModel> = {}): TradesModel {
  const cycles = overrides.cycles ?? [];
  const orders = overrides.orders ?? [];
  const reports = overrides.reports ?? [];

  return {
    loading: false,
    refreshing: false,
    error: "",
    expandedReportCycleId: null,
    setExpandedReportCycleId: vi.fn(),
    activeTab: "cycles",
    setActiveTab: vi.fn(),
    load: vi.fn(),
    baseCurrency: "USD",
    records: {
      cycles,
      orders,
    },
    reports,
    ledgerMeta: {
      ledgerStartTs: null,
      openingBalance: 0,
      archivedCycleCount: 0,
      archivedTradeCount: 0,
      archivedReportCount: 0,
    },
    cycles,
    orders,
    sortedReports: reports,
    completedCycleCount: 0,
    executedOrderCount: 0,
    executedOrderNotional: 0,
    cycleExecutedNotional: 0,
    manualExecutedNotional: 0,
    totalNotional: 0,
    realizedPnl: 0,
    latestActivityAt: null,
    ...overrides,
  };
}

describe("TradesSections", () => {
  it("订单面板会展示 submitted 与 partially_filled 的中文状态", () => {
    render(
      <TradesTabsPanel
        model={createTradesModel({
          activeTab: "orders",
          orders: [
            buildTradeTicketFixture({
              ticketId: "t-1",
              symbol: "AAPL",
              side: "BUY",
              status: "submitted",
              qty: 1,
              price: 100,
              avgFillPrice: null,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:00:00.000Z",
            }),
            buildTradeTicketFixture({
              ticketId: "t-2",
              symbol: "QQQ",
              side: "SELL",
              status: "partially_filled",
              qty: 2,
              price: 200,
              avgFillPrice: 201,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:05:00.000Z",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("已提交")).toBeTruthy();
    expect(screen.getByText("部分成交")).toBeTruthy();
  });

  it("订单方向会兼容大写 side 并显示中文", () => {
    render(
      <TradesTabsPanel
        model={createTradesModel({
          activeTab: "orders",
          orders: [
            buildTradeTicketFixture({
              ticketId: "t-3",
              symbol: "NVDA",
              side: "BUY",
              status: "executed",
              qty: 1.2,
              price: 180,
              avgFillPrice: 180,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:10:00.000Z",
            }),
            buildTradeTicketFixture({
              ticketId: "t-4",
              symbol: "NVDA",
              side: "SELL",
              status: "executed",
              qty: 0.5,
              price: 181,
              avgFillPrice: 181,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:11:00.000Z",
            }),
          ],
        })}
      />,
    );

    expect(screen.getAllByText("买入").length).toBeGreaterThan(0);
    expect(screen.getAllByText("卖出").length).toBeGreaterThan(0);
  });
});
