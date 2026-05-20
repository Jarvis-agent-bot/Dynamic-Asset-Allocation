import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture } from "@/src/daa/__tests__/testDataFactories";
vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaCurrentLedgerMeta: vi.fn(),
  listDaaCashLedgerEntries: vi.fn(),
  listDaaEquitySnapshots: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrapBundle: vi.fn(),
}));

vi.mock("@/src/daa/notify/notificationStatus", () => ({
  buildNotificationStatusSummary: vi.fn(),
}));

import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import { buildNotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadModelService";
import { clearReadModelMemoryCache } from "@/src/daa/modules/read/readModelMemoryCache";
import { buildWorkbenchBootstrapBundle } from "@/src/daa/modules/workbench/workbenchReadService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";
import {
  type DaaCurrentLedgerMeta,
  type DaaStoreCashLedgerEntry,
  type DaaStoreEquitySnapshot,
  getDaaCurrentLedgerMeta,
  listDaaCashLedgerEntries,
  listDaaEquitySnapshots,
} from "@/src/daa/store/daaStorePg";

function buildNotificationSummaryFixture(
  overrides?: Partial<NotificationStatusSummary>,
): NotificationStatusSummary {
  return {
    cronConfigured: true,
    recentJobs: [],
    channels: {
      telegram: {
        channel: "telegram",
        enabled: false,
        configured: false,
        secretStates: [],
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        deliveryEvents: [],
      },
      feishu: {
        channel: "feishu",
        enabled: false,
        configured: false,
        secretStates: [],
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        deliveryEvents: [],
      },
    },
    telegramAssistant: {
      ready: true,
      secretStates: [],
      lastSessionAt: null,
      lastUserText: null,
      lastAssistantText: null,
      lastIntentKind: null,
      participantId: null,
      title: null,
    },
    ...overrides,
  };
}

function buildTradeLogFixture(input: {
  ticketId: string;
  createdAt: string;
}): TradeTicket {
  return {
    ticketId: input.ticketId,
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
    createdAt: input.createdAt,
    executedAt: null,
    canceledAt: null,
    updatedAt: input.createdAt,
  };
}

function buildEquitySnapshotFixture(input: {
  ts: string;
  totalEquity: number;
}): DaaStoreEquitySnapshot {
  return {
    ts: input.ts,
    totalEquity: input.totalEquity,
    holdingsValue: input.totalEquity - 200,
    cash: 200,
    source: "test",
  };
}

function buildCashLedgerEntryFixture(input: {
  ts: string;
  amount: number;
}): DaaStoreCashLedgerEntry {
  return {
    id: `ledger-${input.ts}`,
    ts: input.ts,
    side: "deposit",
    amount: input.amount,
    baseCurrency: "USD",
    entryKind: "manual",
    accountBaseCurrency: "USD",
    amountInAccountBase: input.amount,
    fxRateToAccount: 1,
    ticketId: null,
    cycleId: null,
    settlementTs: input.ts,
    note: null,
    createdAt: input.ts,
  };
}

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

describe("workbench-read-model-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReadModelMemoryCache();
  });

  it("复用 bootstrap bundle 的 cycles，不再额外读取周期列表", async () => {
    const keepCycle: RebalanceCycle = {
      cycleId: "cycle-keep",
      status: "generated",
      triggerSource: "manual",
      triggerReason: "manual_run",
      snapshotAt: "2026-03-02T00:00:00.000Z",
      equitySnapshot: 2000,
      driftSnapshot: [],
      createdAt: "2026-03-02T00:00:00.000Z",
      proposals: [],
      executedOrders: [],
      riskCheck: { overallStatus: "pass", items: [] },
      executedAt: null,
      notes: null,
      executionSummary: null,
      cancelledAt: null,
      cancelReason: null,
      marketContext: null,
    };
    const droppedCycle = {
      ...keepCycle,
      cycleId: "cycle-drop",
      snapshotAt: "2026-02-20T00:00:00.000Z",
      createdAt: "2026-02-20T00:00:00.000Z",
    };

    vi.mocked(buildWorkbenchBootstrapBundle).mockResolvedValue({
      bootstrap: buildWorkbenchBootstrapFixture({
        account: {
          cash: 1000,
          investableCash: 900,
          frozenCash: 100,
          totalEquity: 2000,
        },
        execution: {
          logs: [
            buildTradeLogFixture({ ticketId: "log-drop", createdAt: "2026-02-20T00:00:00.000Z" }),
            buildTradeLogFixture({ ticketId: "log-keep", createdAt: "2026-03-02T00:00:00.000Z" }),
          ],
        },
        latestCycle: keepCycle,
      }),
      cycles: [keepCycle, droppedCycle],
    });
    vi.mocked(listDaaEquitySnapshots).mockResolvedValue([
      buildEquitySnapshotFixture({ ts: "2026-02-20T00:00:00.000Z", totalEquity: 1800 }),
      buildEquitySnapshotFixture({ ts: "2026-03-02T00:00:00.000Z", totalEquity: 2000 }),
    ]);
    vi.mocked(listDaaCashLedgerEntries).mockResolvedValue([
      buildCashLedgerEntryFixture({ ts: "2026-02-20T00:00:00.000Z", amount: 100 }),
      buildCashLedgerEntryFixture({ ts: "2026-03-02T00:00:00.000Z", amount: 200 }),
    ]);
    vi.mocked(getDaaCurrentLedgerMeta).mockResolvedValue(buildLedgerMetaFixture());
    vi.mocked(buildNotificationStatusSummary).mockResolvedValue(buildNotificationSummaryFixture());

    const result = await buildWorkbenchReadModel();

    expect(vi.mocked(buildWorkbenchBootstrapBundle)).toHaveBeenCalledTimes(1);
    expect(result.cycles.map((item) => item.cycleId)).toEqual(["cycle-keep"]);
    expect(result.snapshots).toHaveLength(1);
    expect(result.cashLedger).toHaveLength(1);
    expect(result.bootstrap.execution.logs).toHaveLength(1);
    expect(result.bootstrap.latestCycle?.cycleId).toBe("cycle-keep");
  });

  it("短时间复用无副作用 workbench read model", async () => {
    vi.mocked(buildWorkbenchBootstrapBundle).mockResolvedValue({
      bootstrap: buildWorkbenchBootstrapFixture({
        account: {
          cash: 1000,
          investableCash: 900,
          frozenCash: 100,
          totalEquity: 2000,
        },
      }),
      cycles: [],
    });
    vi.mocked(listDaaEquitySnapshots).mockResolvedValue([]);
    vi.mocked(listDaaCashLedgerEntries).mockResolvedValue([]);
    vi.mocked(getDaaCurrentLedgerMeta).mockResolvedValue(buildLedgerMetaFixture());
    vi.mocked(buildNotificationStatusSummary).mockResolvedValue(buildNotificationSummaryFixture());

    await buildWorkbenchReadModel({ syncPrices: false, autoRiskCycle: false });
    await buildWorkbenchReadModel({ syncPrices: false, autoRiskCycle: false });

    expect(vi.mocked(buildWorkbenchBootstrapBundle)).toHaveBeenCalledTimes(1);
  });
});
