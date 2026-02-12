import { describe, expect, it } from "vitest";

import {
  LS_PAPER_EXECUTION_LOG_V0,
  appendPaperExecutionLog,
  clearPaperExecutionLog,
  loadPaperExecutionLog,
} from "../executionLogStore";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/executionLogStore", () => {
  it("loadPaperExecutionLog returns [] when missing", () => {
    const st = new MemStorage();
    expect(loadPaperExecutionLog(st as any)).toEqual([]);
  });

  it("appendPaperExecutionLog rejects empty/invalid orders", () => {
    const st = new MemStorage();
    const r1 = appendPaperExecutionLog({ storage: st as any, source: "rebalance-simulate", orders: [] });
    expect(r1.ok).toBe(false);

    const r2 = appendPaperExecutionLog({
      storage: st as any,
      source: "rebalance-simulate",
      orders: [{ symbol: "", side: "BUY", notional: 10 }],
    });
    expect(r2.ok).toBe(false);
  });

  it("appendPaperExecutionLog normalizes orders and persists", () => {
    const st = new MemStorage();

    const r = appendPaperExecutionLog({
      storage: st as any,
      source: "rebalance-core",
      orders: [
        { symbol: " SPY ", side: "BUY", notional: 100, reason: "x" },
        { symbol: "TLT", side: "HOLD", notional: 100 },
        { symbol: "GLD", side: "SELL", notional: "200" },
        { symbol: "BAD", side: "BUY", notional: "nope" },
      ],
      note: "paper run",
      at: "2026-02-12T00:00:00.000Z",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    expect(r.entry.kind).toBe("paper");
    expect(r.entry.source).toBe("rebalance-core");
    expect(r.entry.at).toBe("2026-02-12T00:00:00.000Z");
    expect(r.entry.orders).toEqual([
      { symbol: "SPY", side: "BUY", notional: 100, reason: "x" },
      { symbol: "GLD", side: "SELL", notional: 200 },
    ]);

    const raw = st.getItem(LS_PAPER_EXECUTION_LOG_V0);
    expect(typeof raw).toBe("string");

    const roundtrip = loadPaperExecutionLog(st as any);
    expect(roundtrip).toHaveLength(1);
    expect(roundtrip[0].orders).toEqual(r.entry.orders);
  });

  it("appendPaperExecutionLog respects maxEntries", () => {
    const st = new MemStorage();

    for (let i = 0; i < 5; i++) {
      const r = appendPaperExecutionLog({
        storage: st as any,
        source: "rebalance-simulate",
        orders: [{ symbol: "SPY", side: "BUY", notional: 10 + i }],
        maxEntries: 3,
      });
      expect(r.ok).toBe(true);
    }

    const log = loadPaperExecutionLog(st as any);
    expect(log).toHaveLength(3);
    expect(log[0].orders[0].notional).toBe(12);
    expect(log[2].orders[0].notional).toBe(14);
  });

  it("clearPaperExecutionLog sets an empty list", () => {
    const st = new MemStorage();
    appendPaperExecutionLog({
      storage: st as any,
      source: "rebalance-simulate",
      orders: [{ symbol: "SPY", side: "BUY", notional: 1 }],
    });

    clearPaperExecutionLog(st as any);
    expect(loadPaperExecutionLog(st as any)).toEqual([]);
  });
});
