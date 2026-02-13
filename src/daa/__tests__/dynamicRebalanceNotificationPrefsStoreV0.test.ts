import { describe, expect, it } from "vitest";

import {
  LS_DYNAMIC_REBALANCE_NOTIFY_PREFS_V0,
  defaultDynamicRebalanceNotifyPrefsV0,
  loadDynamicRebalanceNotifyPrefsStateV1,
  persistDynamicRebalanceNotifyPrefsV0,
} from "../dynamicRebalanceNotificationPrefsStoreV0";

class MemStorage {
  private m = new Map<string, string>();
  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }
}

describe("daa/dynamicRebalanceNotificationPrefsStoreV0", () => {
  it("loadDynamicRebalanceNotifyPrefsStateV1 returns defaults when missing/invalid", () => {
    const st = new MemStorage();

    const a = loadDynamicRebalanceNotifyPrefsStateV1(st as any);
    expect(a.schemaVersion).toBe(1);
    expect(a.prefs).toEqual(defaultDynamicRebalanceNotifyPrefsV0());

    st.setItem(LS_DYNAMIC_REBALANCE_NOTIFY_PREFS_V0, "{bad json");
    const b = loadDynamicRebalanceNotifyPrefsStateV1(st as any);
    expect(b.prefs).toEqual(defaultDynamicRebalanceNotifyPrefsV0());

    st.setItem(LS_DYNAMIC_REBALANCE_NOTIFY_PREFS_V0, JSON.stringify({ schemaVersion: 2 }));
    const c = loadDynamicRebalanceNotifyPrefsStateV1(st as any);
    expect(c.prefs).toEqual(defaultDynamicRebalanceNotifyPrefsV0());
  });

  it("persistDynamicRebalanceNotifyPrefsV0 normalizes prefs", () => {
    const st = new MemStorage();

    const r = persistDynamicRebalanceNotifyPrefsV0({
      storage: st as any,
      prefsLike: {
        enabled: false,
        channel: { browser: true },
        events: { scheduleDue: false, skipMarketClosed: true, skipDataStale: false, runRecorded: true },
      },
      updatedAt: "2026-02-14T00:00:00.000Z",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    const loaded = loadDynamicRebalanceNotifyPrefsStateV1(st as any);
    expect(loaded.updatedAt).toBe("2026-02-14T00:00:00.000Z");
    expect(loaded.prefs.enabled).toBe(false);
    expect(loaded.prefs.channel.browser).toBe(true);
    expect(loaded.prefs.events.scheduleDue).toBe(false);
    expect(loaded.prefs.events.skipMarketClosed).toBe(true);
    expect(loaded.prefs.events.skipDataStale).toBe(false);
    expect(loaded.prefs.events.runRecorded).toBe(true);

    // Partial/invalid input should fall back to defaults for missing fields.
    persistDynamicRebalanceNotifyPrefsV0({ storage: st as any, prefsLike: { enabled: true, events: { runRecorded: false } } });
    const loaded2 = loadDynamicRebalanceNotifyPrefsStateV1(st as any);
    expect(loaded2.prefs.enabled).toBe(true);
    expect(loaded2.prefs.events.runRecorded).toBe(false);
    expect(loaded2.prefs.events.scheduleDue).toBe(true);
  });
});
