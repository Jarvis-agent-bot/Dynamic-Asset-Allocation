import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTradesReadModel } from "@/src/daa/modules/read/tradesReadService";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/tradesReadService", () => ({
  buildTradesReadModel: vi.fn(),
}));

import { GET } from "@/app/api/daa/read/trades/route";

describe("trades-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildTradesReadModel).mockResolvedValue({
      records: {
        cycles: [{ cycleId: "cycle-1", status: "completed", triggerSource: "manual", createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", proposals: [], executedOrders: [], riskCheck: null, notes: null, executionSummary: null, marketContext: null }],
        orders: [{ ticketId: "ticket-1", symbol: "AAPL", side: "BUY", status: "executed", qty: 1, price: 180, currency: "USD", updatedAt: "2026-03-01T00:00:00.000Z" }],
      },
      reports: [{ cycleId: "cycle-1", triggerSource: "manual", status: "completed", createdAt: "2026-03-01T00:00:00.000Z", reportCreatedAt: "2026-03-01T01:00:00.000Z", executionSummary: null, beforeSnapshot: { totalEquity: 1000, holdingsValue: 700, cash: 300, hhiPct: 20, maxWeightPct: 15, maxDriftPct: 10, maxDrawdownPct: 5 }, afterSnapshot: { totalEquity: 1100, holdingsValue: 800, cash: 300, hhiPct: 18, maxWeightPct: 14, maxDriftPct: 6, maxDrawdownPct: 4 }, pnlAttribution: { realizedPnl: 10, unrealizedPnl: 5, feeTotal: 1, fxImpact: 0, topContributors: [] }, riskDelta: { maxDrawdownBefore: 5, maxDrawdownAfter: 4, hhiBefore: 20, hhiAfter: 18, maxWeightBefore: 15, maxWeightAfter: 14, maxDriftBefore: 10, maxDriftAfter: 6 } }],
      loadedAt: "2026-03-01T00:00:00.000Z",
    } as any);
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
