import { describe, expect, it } from "vitest";

import { getDefaultExecutionAdapterV0, getExecutionAdapterV0 } from "../executionAdapterV0";
import { LS_PAPER_EXECUTION_LOG_V0, loadPaperExecutionLog } from "../executionLogStore";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/executionAdapterV0", () => {
  it("default adapter is paper", () => {
    const ex = getDefaultExecutionAdapterV0();
    expect(ex.kind).toBe("paper");
  });

  it("paper adapter persists a paper execution entry", () => {
    const st = new MemStorage();
    const ex = getExecutionAdapterV0("paper");

    const r = ex.executeOrders({
      storage: st as any,
      source: "rebalance-core",
      orders: [{ symbol: " SPY ", side: "BUY", notional: 10 }],
      note: "ui:test",
      at: "2026-02-12T00:00:00.000Z",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    expect(r.entry.kind).toBe("paper");
    expect(r.entry.orders).toEqual([{ symbol: "SPY", side: "BUY", notional: 10 }]);

    const raw = st.getItem(LS_PAPER_EXECUTION_LOG_V0);
    expect(typeof raw).toBe("string");

    const roundtrip = loadPaperExecutionLog(st as any);
    expect(roundtrip).toHaveLength(1);
    expect(roundtrip[0].id).toBe(r.entry.id);
  });

  it("real adapter returns an explicit not-configured error", () => {
    const ex = getExecutionAdapterV0("real");
    const r = ex.executeOrders({ storage: null, source: "rebalance-core", orders: [] });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("real");
    expect(r.error).toMatch(/not configured/i);
  });
});
