import { describe, expect, it } from "vitest";

import {
  attachOrdersToRebalanceRunV0,
  finishRebalanceOrderStatusRunV0,
  loadRebalanceOrderStatusRunV0,
  startRebalanceOrderStatusRunV0,
  updateRebalanceOrderStatusV0,
} from "../rebalanceOrderStatusRunStoreV0";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private m = new Map<string, string>();

  getItem(key: string): string | null {
    return this.m.has(key) ? (this.m.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.m.set(key, String(value));
  }
}

describe("rebalanceOrderStatusRunStoreV0", () => {
  it("tracks a run from start -> attach orders -> update -> finish", () => {
    const st = new MemoryStorage();

    const started = startRebalanceOrderStatusRunV0({ storage: st, message: "run" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const runId = started.run.runId;

    const attached = attachOrdersToRebalanceRunV0({
      storage: st,
      runId,
      orders: [
        { symbol: "AAA", side: "SELL", notional: 100 },
        { symbol: "BBB", side: "BUY", notional: 100 },
      ],
    });

    expect(attached.ok).toBe(true);
    if (!attached.ok) return;

    expect(attached.run.orders.map((o) => `${o.id}:${o.side}:${o.symbol}:${o.status}`)).toEqual([
      "1:SELL:AAA:queued",
      "2:BUY:BBB:queued",
    ]);

    const u1 = updateRebalanceOrderStatusV0({ storage: st, runId, orderId: "1", status: "submitted" });
    expect(u1.ok).toBe(true);

    const u2 = updateRebalanceOrderStatusV0({ storage: st, runId, orderId: "1", status: "filled" });
    expect(u2.ok).toBe(true);

    const finished = finishRebalanceOrderStatusRunV0({ storage: st, runId });
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;

    expect(finished.run.state).toBe("done");

    const loaded = loadRebalanceOrderStatusRunV0(st);
    expect(loaded?.runId).toBe(runId);
    expect(loaded?.state).toBe("done");
    expect(loaded?.orders.find((o) => o.id === "1")?.status).toBe("filled");
  });

  it("rejects updates for a stale runId", () => {
    const st = new MemoryStorage();

    const started = startRebalanceOrderStatusRunV0({ storage: st });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const r = updateRebalanceOrderStatusV0({ storage: st, runId: "nope", orderId: "1", status: "filled" });
    expect(r.ok).toBe(false);
  });
});
