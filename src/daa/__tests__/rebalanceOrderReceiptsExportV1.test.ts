import { describe, expect, it } from "vitest";

import { buildRebalanceOrderReceiptsV1 } from "../rebalanceOrderReceiptsExportV1";

describe("daa/rebalanceOrderReceiptsExportV1", () => {
  it("buildRebalanceOrderReceiptsV1 wraps a run with a stable schema and summary", () => {
    const run = {
      schemaVersion: 1,
      runId: "rebalance_run_123",
      createdAt: "2026-02-14T00:00:00.000Z",
      updatedAt: "2026-02-14T00:01:00.000Z",
      state: "done",
      phase: "done",
      orders: [
        {
          id: "1",
          symbol: "SPY",
          side: "BUY",
          notional: 100,
          status: "filled",
          filledNotional: 100,
          fillPct01: 1,
          updatedAt: "2026-02-14T00:01:00.000Z",
        },
        {
          id: "2",
          symbol: "TLT",
          side: "SELL",
          notional: 200,
          status: "failed",
          updatedAt: "2026-02-14T00:01:00.000Z",
          detail: "insufficient balance",
        },
      ],
    } as any;

    const r = buildRebalanceOrderReceiptsV1({ run, exportedAt: "2026-02-14T00:02:00.000Z" });

    expect(r.schemaVersion).toBe(1);
    expect(r.kind).toBe("rebalance_order_receipts");
    expect(r.exportedAt).toBe("2026-02-14T00:02:00.000Z");

    expect(r.summary.totalOrders).toBe(2);
    expect(r.summary.filled).toBe(1);
    expect(r.summary.failed).toBe(1);

    expect(r.run.runId).toBe("rebalance_run_123");
  });
});
