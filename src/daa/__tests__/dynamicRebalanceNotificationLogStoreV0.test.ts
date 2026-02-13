import { describe, expect, it } from "vitest";

import {
  LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0,
  appendDynamicRebalanceNotificationLogV0,
  clearDynamicRebalanceNotificationLogV0,
  loadDynamicRebalanceNotificationLogV0,
} from "../dynamicRebalanceNotificationLogStoreV0";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/dynamicRebalanceNotificationLogStoreV0", () => {
  it("loadDynamicRebalanceNotificationLogV0 returns [] when missing/invalid", () => {
    const st = new MemStorage();
    expect(loadDynamicRebalanceNotificationLogV0(st as any)).toEqual([]);

    st.setItem(LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0, "{bad json");
    expect(loadDynamicRebalanceNotificationLogV0(st as any)).toEqual([]);

    st.setItem(LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0, JSON.stringify({ nope: true }));
    expect(loadDynamicRebalanceNotificationLogV0(st as any)).toEqual([]);

    st.setItem(LS_DYNAMIC_REBALANCE_NOTIFICATION_LOG_V0, JSON.stringify(["bad"]));
    expect(loadDynamicRebalanceNotificationLogV0(st as any)).toEqual([]);
  });

  it("appendDynamicRebalanceNotificationLogV0 persists and dedupes by at+kind", () => {
    const st = new MemStorage();

    const r1 = appendDynamicRebalanceNotificationLogV0({
      storage: st as any,
      at: "2026-02-14T01:00:00.000Z",
      kind: "schedule-due",
      title: "Due",
      body: "Run now",
      recordedAt: "2026-02-14T01:00:01.000Z",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error("unreachable");

    const r2 = appendDynamicRebalanceNotificationLogV0({
      storage: st as any,
      at: "2026-02-14T01:00:00.000Z",
      kind: "schedule-due",
      title: "Due",
      body: "Run now",
      recordedAt: "2026-02-14T01:00:02.000Z",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error("unreachable");

    expect(r2.entry.id).toBe(r1.entry.id);
    expect(loadDynamicRebalanceNotificationLogV0(st as any)).toHaveLength(1);
  });

  it("appendDynamicRebalanceNotificationLogV0 respects maxEntries", () => {
    const st = new MemStorage();

    for (let i = 0; i < 5; i++) {
      const at = new Date(Date.UTC(2026, 1, 14, i, 0, 0, 0)).toISOString();
      const r = appendDynamicRebalanceNotificationLogV0({
        storage: st as any,
        at,
        kind: "run-recorded",
        title: "Recorded",
        body: `run ${i}`,
        maxEntries: 3,
      });
      expect(r.ok).toBe(true);
    }

    const log = loadDynamicRebalanceNotificationLogV0(st as any);
    expect(log).toHaveLength(3);
    expect(log[0].body).toBe("run 2");
    expect(log[2].body).toBe("run 4");
  });

  it("clearDynamicRebalanceNotificationLogV0 sets an empty list", () => {
    const st = new MemStorage();

    appendDynamicRebalanceNotificationLogV0({
      storage: st as any,
      at: "2026-02-14T01:00:00.000Z",
      kind: "unknown",
      title: "x",
      body: "y",
    });

    clearDynamicRebalanceNotificationLogV0(st as any);
    expect(loadDynamicRebalanceNotificationLogV0(st as any)).toEqual([]);
  });
});
