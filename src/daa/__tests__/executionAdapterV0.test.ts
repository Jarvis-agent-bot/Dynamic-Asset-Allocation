import { describe, expect, it } from "vitest";

import { getDefaultExecutionAdapterV0, getExecutionAdapterV0, makeRealExecutionAdapterV0 } from "../executionAdapterV0";
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

  it("real adapter validates idempotency key and config with structured errors", () => {
    const ex = getExecutionAdapterV0("real");

    const missingKey = ex.executeOrders({ storage: null, source: "rebalance-core", orders: [] });
    expect(missingKey.ok).toBe(false);
    if (missingKey.ok) throw new Error("unreachable");
    expect(missingKey.kind).toBe("real");
    expect(missingKey.errorDetail?.code).toBe("missing_idempotency_key");

    const invalidConfig = ex.executeOrders({
      storage: null,
      source: "rebalance-core",
      idempotencyKey: "idem-1",
      orders: [],
      realConfig: { provider: "okx", accountId: "acc-1" },
    });
    expect(invalidConfig.ok).toBe(false);
    if (invalidConfig.ok) throw new Error("unreachable");
    expect(invalidConfig.errorDetail?.code).toBe("config_invalid");
    expect(invalidConfig.error).toMatch(/missing/i);
  });

  it("real adapter is idempotent for same idempotency key", () => {
    const ex = makeRealExecutionAdapterV0({ now: () => "2026-02-24T07:00:00.000Z" });

    const args = {
      storage: null,
      source: "rebalance-core" as const,
      idempotencyKey: "idem-2",
      orders: [{ symbol: "SPY", side: "BUY", notional: 10 }],
      realConfig: {
        provider: "okx" as const,
        accountId: "acc-1",
        apiKey: "k",
        apiSecret: "s",
        apiPassphrase: "p",
      },
    };

    const first = ex.executeOrders(args);
    const second = ex.executeOrders(args);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("unreachable");

    expect(first.kind).toBe("real");
    expect(second.kind).toBe("real");
    expect(first.receipt).toEqual(second.receipt);
    expect(first.receipt.idempotencyKey).toBe("idem-2");
    expect(first.receipt.orderCount).toBe(1);
  });
});
