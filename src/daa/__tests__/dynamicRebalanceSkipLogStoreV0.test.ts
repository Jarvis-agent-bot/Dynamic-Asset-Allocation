import { describe, expect, it } from "vitest";

import type { DynamicRebalancePauseReasonV0 } from "../dynamicRebalancePausedReasonV0";

import {
  LS_DYNAMIC_REBALANCE_SKIP_LOG_V0,
  appendDynamicRebalanceSkipLogV0,
  clearDynamicRebalanceSkipLogV0,
  loadDynamicRebalanceSkipLogV0,
} from "../dynamicRebalanceSkipLogStoreV0";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/dynamicRebalanceSkipLogStoreV0", () => {
  it("loadDynamicRebalanceSkipLogV0 returns [] when missing/invalid", () => {
    const st = new MemStorage();
    expect(loadDynamicRebalanceSkipLogV0(st as any)).toEqual([]);

    st.setItem(LS_DYNAMIC_REBALANCE_SKIP_LOG_V0, "{bad json");
    expect(loadDynamicRebalanceSkipLogV0(st as any)).toEqual([]);

    st.setItem(LS_DYNAMIC_REBALANCE_SKIP_LOG_V0, JSON.stringify({ nope: true }));
    expect(loadDynamicRebalanceSkipLogV0(st as any)).toEqual([]);

    st.setItem(LS_DYNAMIC_REBALANCE_SKIP_LOG_V0, JSON.stringify(["bad"]));
    expect(loadDynamicRebalanceSkipLogV0(st as any)).toEqual([]);
  });

  it("appendDynamicRebalanceSkipLogV0 persists and dedupes by at+kind", () => {
    const st = new MemStorage();

    const reason: DynamicRebalancePauseReasonV0 = {
      kind: "paused-market-closed",
      title: "Paused (market closed)",
      detail: "Next open...",
      nextOpenAt: new Date("2026-02-16T01:30:00.000Z"),
    };

    const r1 = appendDynamicRebalanceSkipLogV0({
      storage: st as any,
      at: "2026-02-14T01:00:00.000Z",
      recordedAt: "2026-02-14T02:00:00.000Z",
      reason,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error("unreachable");

    const r2 = appendDynamicRebalanceSkipLogV0({
      storage: st as any,
      at: "2026-02-14T01:00:00.000Z",
      recordedAt: "2026-02-14T03:00:00.000Z",
      reason,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error("unreachable");

    // Same at+kind should return existing entry and keep log length stable.
    expect(r2.entry.id).toBe(r1.entry.id);
    expect(loadDynamicRebalanceSkipLogV0(st as any)).toHaveLength(1);
  });

  it("appendDynamicRebalanceSkipLogV0 supports user-cancelled", () => {
    const st = new MemStorage();

    const r = appendDynamicRebalanceSkipLogV0({
      storage: st as any,
      at: "2026-02-14T01:00:00.000Z",
      recordedAt: "2026-02-14T02:00:00.000Z",
      reason: { kind: "user-cancelled", title: "Cancelled (user)", detail: "User cancelled the run" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    const loaded = loadDynamicRebalanceSkipLogV0(st as any);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].kind).toBe("user-cancelled");
  });

  it("appendDynamicRebalanceSkipLogV0 respects maxEntries", () => {
    const st = new MemStorage();

    const reason: DynamicRebalancePauseReasonV0 = {
      kind: "stalled-data-stale",
      title: "Stalled (price data stale)",
      detail: "Update snapshot",
      priceUpdatedAt: new Date("2026-02-14T00:00:00.000Z"),
      ageMin: 120,
    };

    for (let i = 0; i < 5; i++) {
      const r = appendDynamicRebalanceSkipLogV0({
        storage: st as any,
        at: new Date(Date.UTC(2026, 1, 14, i, 0, 0, 0)).toISOString(),
        reason,
        maxEntries: 3,
      });
      expect(r.ok).toBe(true);
    }

    const log = loadDynamicRebalanceSkipLogV0(st as any);
    expect(log).toHaveLength(3);
    expect(log[0].at).toBe(new Date(Date.UTC(2026, 1, 14, 2, 0, 0, 0)).toISOString());
    expect(log[2].at).toBe(new Date(Date.UTC(2026, 1, 14, 4, 0, 0, 0)).toISOString());
  });

  it("clearDynamicRebalanceSkipLogV0 sets an empty list", () => {
    const st = new MemStorage();

    const reason: DynamicRebalancePauseReasonV0 = {
      kind: "paused-market-closed",
      title: "Paused",
      detail: "x",
      nextOpenAt: new Date("2026-02-16T01:30:00.000Z"),
    };

    appendDynamicRebalanceSkipLogV0({ storage: st as any, at: "2026-02-14T01:00:00.000Z", reason });

    clearDynamicRebalanceSkipLogV0(st as any);
    expect(loadDynamicRebalanceSkipLogV0(st as any)).toEqual([]);
  });
});
