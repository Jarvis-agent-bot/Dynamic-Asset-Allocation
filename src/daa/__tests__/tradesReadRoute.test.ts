import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradesReadModel } from "@/src/daa/modules/read/readModels";
import { buildTradesReadModel } from "@/src/daa/modules/read/tradesReadService";
import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";
import type {
  RebalanceCycle,
  WorkbenchRebalanceCycleReport,
} from "@/src/daa/modules/workbench/workbenchTypes";
import type { DaaCurrentLedgerMeta } from "@/src/daa/store/daaStorePg";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/tradesReadService", () => ({
  buildTradesReadModel: vi.fn(),
}));

import { GET } from "@/app/api/daa/read/trades/route";

function buildLedgerMetaFixture(
  overrides?: Partial<DaaCurrentLedgerMeta>,
): DaaCurrentLedgerMeta {
  return {
    ledgerStartTs: "2026-03-01T00:00:00.000Z",
    openingBalance: 0,
    archivedCycleCount: 0,
    archivedTradeCount: 0,
    archivedReportCount: 0,
    ...overrides,
  };
}

function buildCycleFixture(
  overrides?: Partial<RebalanceCycle>,
): RebalanceCycle {
  return {
    cycleId: "cycle-1",
    status: "completed",
    triggerSource: "manual",
    triggerReason: "手动生成",
    snapshotAt: "2026-03-01T00:00:00.000Z",
    equitySnapshot: 1000,
    driftSnapshot: [],
    proposals: [],
    riskCheck: {
      overallStatus: "pass",
      items: [],
    },
    executedAt: "2026-03-01T00:30:00.000Z",
    executedOrders: ["ticket-1"],
    executionSummary: {
      ordersExecuted: 1,
      ordersSubmitted: 0,
      ordersFailed: 0,
      totalNotional: 180,
      newMaxDriftPct: 6,
    },
    cancelledAt: null,
    cancelReason: null,
    notes: null,
    marketContext: null,
    llmDecisionSnapshot: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildTradeTicketFixture(
  overrides?: Partial<TradeTicket>,
): TradeTicket {
  return {
    ticketId: "ticket-1",
    basketId: "basket-1",
    assetKey: "US::AAPL",
    cycleId: "cycle-1",
    source: "manual",
    status: "executed",
    symbol: "AAPL",
    market: "US",
    instrumentCurrency: "USD",
    baseCurrency: "USD",
    side: "BUY",
    qty: 1,
    price: 180,
    fee: 1,
    grossNotional: 180,
    fxRateToBase: 1,
    notionalInBase: 180,
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
    filledQty: 1,
    avgFillPrice: 180,
    lastBrokerSyncAt: null,
    lastAppliedFillQty: 1,
    brokerRejectReason: null,
    brokerRaw: null,
    createdBy: "test",
    createdAt: "2026-03-01T00:00:00.000Z",
    executedAt: "2026-03-01T00:30:00.000Z",
    canceledAt: null,
    updatedAt: "2026-03-01T00:30:00.000Z",
    ...overrides,
  };
}

function buildReportFixture(
  overrides?: Partial<WorkbenchRebalanceCycleReport>,
): WorkbenchRebalanceCycleReport {
  return {
    cycleId: "cycle-1",
    triggerSource: "manual",
    status: "completed",
    createdAt: "2026-03-01T00:00:00.000Z",
    reportCreatedAt: "2026-03-01T01:00:00.000Z",
    executionSummary: {
      ordersExecuted: 1,
      ordersSubmitted: 0,
      ordersFailed: 0,
      totalNotional: 180,
      newMaxDriftPct: 6,
    },
    beforeSnapshot: {
      totalEquity: 1000,
      holdingsValue: 700,
      cash: 300,
      hhiPct: 20,
      maxWeightPct: 15,
      maxDriftPct: 10,
      maxDrawdownPct: 5,
    },
    afterSnapshot: {
      totalEquity: 1100,
      holdingsValue: 800,
      cash: 300,
      hhiPct: 18,
      maxWeightPct: 14,
      maxDriftPct: 6,
      maxDrawdownPct: 4,
    },
    pnlAttribution: {
      realizedPnl: 10,
      unrealizedPnl: 5,
      feeTotal: 1,
      fxImpact: 0,
      topContributors: [],
    },
    riskDelta: {
      maxDrawdownBefore: 5,
      maxDrawdownAfter: 4,
      hhiBefore: 20,
      hhiAfter: 18,
      maxWeightBefore: 15,
      maxWeightAfter: 14,
      maxDriftBefore: 10,
      maxDriftAfter: 6,
    },
    ...overrides,
  };
}

function buildTradesReadModelFixture(
  overrides?: Partial<TradesReadModel>,
): TradesReadModel {
  return {
    baseCurrency: "USD",
    records: {
      cycles: [buildCycleFixture()],
      orders: [buildTradeTicketFixture()],
    },
    reports: [buildReportFixture()],
    ledgerMeta: buildLedgerMetaFixture(),
    loadedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("trades-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildTradesReadModel).mockResolvedValue(buildTradesReadModelFixture());
  });

  it("返回统一 trades read model", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/trades"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.records.orders[0].ticketId).toBe("ticket-1");
    expect(json.data.reports[0].cycleId).toBe("cycle-1");
    expect(vi.mocked(buildTradesReadModel)).toHaveBeenCalledTimes(1);
  });
});
