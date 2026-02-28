import { afterEach, describe, expect, it } from "vitest";

import {
  DEPRECATED_STORAGE_KEYS_V1,
  LS_UNIFIED_INPUT_V1,
  LS_UNIFIED_MIGRATION_MARK_V1,
  bootstrapUnifiedInputRuntimeV1,
  loadUnifiedInputStateV1,
  saveUnifiedMoneyPlanV1,
} from "../../../app/daa/unifiedInputStore";

class MemStorage {
  private m = new Map<string, string>();

  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }

  removeItem(key: string) {
    this.m.delete(key);
  }
}

function installWindow(storage: MemStorage) {
  (globalThis as any).window = {
    localStorage: storage,
    dispatchEvent: () => true,
  };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe("unifiedInputStore v1", () => {
  it("不再从历史 key 自动读数据", () => {
    const storage = new MemStorage();
    installWindow(storage);

    storage.setItem("daa.wizard.moneyPlan", JSON.stringify({ account: { baseCcy: "USD" } }));
    storage.setItem("daa.wizard.marketEvents", JSON.stringify([{ id: "e1" }]));

    const st = loadUnifiedInputStateV1();

    expect(st.moneyPlan).toBeNull();
    expect(st.marketEvents).toBeNull();
    expect(storage.getItem(LS_UNIFIED_INPUT_V1)).toBeNull();
  });

  it("统一写入会清理历史 key", () => {
    const storage = new MemStorage();
    installWindow(storage);

    storage.setItem("daa.wizard.moneyPlan", JSON.stringify({ id: "legacy" }));

    saveUnifiedMoneyPlanV1({ id: "u1", name: "Alice" }, { dispatchEvent: false });

    const raw = storage.getItem(LS_UNIFIED_INPUT_V1);
    const parsed = raw ? (JSON.parse(raw) as any) : null;

    expect(parsed?.moneyPlan).toEqual({ id: "u1", name: "Alice" });
    expect(storage.getItem("daa.wizard.moneyPlan")).toBeNull();
  });

  it("bootstrap 会一次性清理所有下线 key", () => {
    const storage = new MemStorage();
    installWindow(storage);

    for (const key of DEPRECATED_STORAGE_KEYS_V1) {
      storage.setItem(key, JSON.stringify({ any: true }));
    }

    bootstrapUnifiedInputRuntimeV1({ dispatchEvent: false });

    for (const key of DEPRECATED_STORAGE_KEYS_V1) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem(LS_UNIFIED_MIGRATION_MARK_V1)).toBeTruthy();
  });
});
