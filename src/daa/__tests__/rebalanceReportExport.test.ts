import { describe, expect, it } from "vitest";

import { appendPaperExecutionLog } from "../executionLogStore";
import { appendRebalanceLog } from "../rebalanceLogStore";
import { buildLatestRebalanceRunReportV1 } from "../rebalanceReportExport";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/rebalanceReportExport", () => {
  it("buildLatestRebalanceRunReportV1 returns a schemaVersioned report even when empty", () => {
    const st = new MemStorage();
    const r = buildLatestRebalanceRunReportV1(st as any);

    expect(r.schemaVersion).toBe(1);
    expect(r.kind).toBe("rebalance_run_report");
    expect(typeof r.exportedAt).toBe("string");
    expect(r.run.rebalanceLogEntry).toBe(null);
    expect(r.run.paperExecutionLogEntry).toBe(null);
    expect(Array.isArray(r.notes)).toBe(true);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("prefers the latest paper-run entries and uses request/response from the rebalance log entry", () => {
    const st = new MemStorage();

    // Non-paper run (should be ignored when paper runs exist)
    appendRebalanceLog({
      storage: st as any,
      source: "core",
      note: "other",
      at: "2026-02-12T00:00:00.000Z",
      request: { req: 0 },
      response: { orders: [{ symbol: "SPY", side: "BUY", notional: 1 }] },
    });

    // Paper run 1
    appendRebalanceLog({
      storage: st as any,
      source: "core",
      note: "ui:market/funds:paper-run",
      at: "2026-02-12T01:00:00.000Z",
      request: { req: 1 },
      response: { orders: [{ symbol: "SPY", side: "BUY", notional: 10 }] },
    });

    // Paper run 2 (latest)
    appendRebalanceLog({
      storage: st as any,
      source: "core",
      note: "ui:market/funds:paper-run",
      at: "2026-02-12T02:00:00.000Z",
      request: { req: 2 },
      response: { orders: [{ symbol: "TLT", side: "SELL", notional: 20 }] },
    });

    // Paper execution log; we expect the latest one.
    appendPaperExecutionLog({
      storage: st as any,
      source: "rebalance-core",
      note: "ui:market/funds:paper-run",
      at: "2026-02-12T01:30:00.000Z",
      orders: [{ symbol: "SPY", side: "BUY", notional: 10 }],
    });

    appendPaperExecutionLog({
      storage: st as any,
      source: "rebalance-core",
      note: "ui:market/funds:paper-run",
      at: "2026-02-12T02:30:00.000Z",
      orders: [{ symbol: "TLT", side: "SELL", notional: 20 }],
    });

    // Stale wizard storage values; should NOT override the rebalance log entry payload.
    st.setItem("daa.wizard.rebalanceRequest", JSON.stringify({ req: 999 }));
    st.setItem("daa.wizard.rebalanceResponse", JSON.stringify({ orders: [] }));

    const r = buildLatestRebalanceRunReportV1(st as any);

    expect(r.run.rebalanceLogEntry?.at).toBe("2026-02-12T02:00:00.000Z");
    expect(r.run.paperExecutionLogEntry?.at).toBe("2026-02-12T02:30:00.000Z");

    expect(r.run.request).toEqual({ req: 2 });
    expect((r.run.response as any)?.orders?.[0]?.symbol).toBe("TLT");

    expect(r.notes.join("\n")).not.toMatch(/missing/);
  });
});
