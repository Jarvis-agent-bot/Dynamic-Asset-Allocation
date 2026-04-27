import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture } from "@/src/daa/__tests__/testDataFactories";
import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import type { WorkbenchReadModel } from "@/src/daa/modules/read/readModels";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DaaCurrentLedgerMeta } from "@/src/daa/store/daaStorePg";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/workbenchReadService", () => ({
  buildWorkbenchReadModel: vi.fn(),
}));

import { GET } from "@/app/api/daa/read/workbench/route";

function buildNotificationSummaryFixture(): NotificationStatusSummary {
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
      ready: false,
      secretStates: [],
      lastSessionAt: null,
      lastUserText: null,
      lastAssistantText: null,
      lastIntentKind: null,
      participantId: null,
      title: null,
    },
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

function buildCycleFixture(
  overrides?: Partial<RebalanceCycle>,
): RebalanceCycle {
  return {
    cycleId: "cycle-1",
    status: "generated",
    triggerSource: "manual",
    triggerReason: "手动生成",
    snapshotAt: "2026-03-01T00:00:00.000Z",
    equitySnapshot: 5200,
    driftSnapshot: [],
    proposals: [],
    riskCheck: {
      overallStatus: "pass",
      items: [],
    },
    executedAt: null,
    executedOrders: [],
    executionSummary: null,
    cancelledAt: null,
    cancelReason: null,
    notes: null,
    marketContext: null,
    agentDecisionSnapshot: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildWorkbenchReadModelFixture(
  overrides?: Partial<WorkbenchReadModel>,
): WorkbenchReadModel {
  return {
    bootstrap: buildWorkbenchBootstrapFixture({
      account: {
        cash: 1200,
        investableCash: 1000,
        frozenCash: 200,
        totalEquity: 5200,
      },
    }),
    cycles: [buildCycleFixture()],
    snapshots: [],
    cashLedger: [],
    signals: [],
    allocationSummary: {
      holdingCount: 0,
      watchlistCount: 0,
      holdingValue: 0,
      cashValue: 1200,
      investableCash: 1000,
      frozenCash: 200,
      totalEquity: 5200,
      equitySource: "account_state_override",
      derivedTotalEquity: 5200,
      fxMissingAssetKeys: [],
      topHoldings: [],
    },
    equityDelta: { dayChange: null, dayChangePct: null, weekChange: null, weekChangePct: null },
    ledgerMeta: buildLedgerMetaFixture(),
    notificationStatus: buildNotificationSummaryFixture(),
    loadedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("workbench-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildWorkbenchReadModel).mockResolvedValue(buildWorkbenchReadModelFixture());
  });

  it("返回统一 workbench read model", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/workbench"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.cycles[0].cycleId).toBe("cycle-1");
    expect(vi.mocked(buildWorkbenchReadModel)).toHaveBeenCalledTimes(1);
  });
});
