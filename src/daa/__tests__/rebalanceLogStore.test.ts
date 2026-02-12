import { describe, expect, it } from "vitest";

import {
  LS_REBALANCE_LOG_V0,
  appendRebalanceLog,
  clearRebalanceLog,
  loadRebalanceLog,
} from "../rebalanceLogStore";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/rebalanceLogStore", () => {
  it("loadRebalanceLog returns [] when missing/invalid", () => {
    const st = new MemStorage();
    expect(loadRebalanceLog(st as any)).toEqual([]);

    st.setItem(LS_REBALANCE_LOG_V0, "{bad json");
    expect(loadRebalanceLog(st as any)).toEqual([]);

    st.setItem(LS_REBALANCE_LOG_V0, JSON.stringify({ nope: true }));
    expect(loadRebalanceLog(st as any)).toEqual([]);
  });

  it("appendRebalanceLog persists and normalizes orders", () => {
    const st = new MemStorage();

    const r = appendRebalanceLog({
      storage: st as any,
      source: "core",
      request: { x: 1 },
      response: {
        orders: [
          { symbol: " SPY ", side: "BUY", notional: 100, reason: "x" },
          { symbol: "TLT", side: "HOLD", notional: 100 },
          { symbol: "GLD", side: "SELL", notional: "200" },
          { symbol: "BAD", side: "BUY", notional: "nope" },
        ],
      },
      note: "run",
      at: "2026-02-12T00:00:00.000Z",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    expect(r.entry.kind).toBe("rebalance");
    expect(r.entry.source).toBe("core");
    expect(r.entry.at).toBe("2026-02-12T00:00:00.000Z");
    expect(r.entry.orders).toEqual([
      { symbol: "SPY", side: "BUY", notional: 100, reason: "x" },
      { symbol: "GLD", side: "SELL", notional: 200 },
    ]);

    const raw = st.getItem(LS_REBALANCE_LOG_V0);
    expect(typeof raw).toBe("string");

    const roundtrip = loadRebalanceLog(st as any);
    expect(roundtrip).toHaveLength(1);
    expect(roundtrip[0].orders).toEqual(r.entry.orders);
  });

  it("appendRebalanceLog allows empty orders (no-op runs)", () => {
    const st = new MemStorage();

    const r = appendRebalanceLog({
      storage: st as any,
      source: "simulate",
      response: { orders: [] },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.entry.orders).toEqual([]);
  });

  it("appendRebalanceLog respects maxEntries", () => {
    const st = new MemStorage();

    for (let i = 0; i < 5; i++) {
      const r = appendRebalanceLog({
        storage: st as any,
        source: "simulate",
        response: { orders: [{ symbol: "SPY", side: "BUY", notional: 10 + i }] },
        maxEntries: 3,
      });
      expect(r.ok).toBe(true);
    }

    const log = loadRebalanceLog(st as any);
    expect(log).toHaveLength(3);
    expect(log[0].orders[0].notional).toBe(12);
    expect(log[2].orders[0].notional).toBe(14);
  });

  it("clearRebalanceLog sets an empty list", () => {
    const st = new MemStorage();
    appendRebalanceLog({ storage: st as any, source: "simulate", response: { orders: [{ symbol: "SPY", side: "BUY", notional: 1 }] } });

    clearRebalanceLog(st as any);
    expect(loadRebalanceLog(st as any)).toEqual([]);
  });
});
