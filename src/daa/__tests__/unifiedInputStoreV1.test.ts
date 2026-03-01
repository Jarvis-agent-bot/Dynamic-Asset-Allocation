import { afterEach, describe, expect, it } from "vitest";

import {
  DEPRECATED_STORAGE_KEYS_V1,
  bootstrapUnifiedInputRuntimeV1,
  cleanupDeprecatedStorageKeysV1,
  loadUnifiedInputStateV1,
  saveUnifiedMoneyPlanV1,
} from "../../../app/daa/unifiedInputStore";

afterEach(() => {
  delete (globalThis as any).__daa_unified_input_state_v1__;
});

describe("unifiedInputStore v1", () => {
  it("启动时返回默认内存态", () => {
    const st = loadUnifiedInputStateV1();

    expect(st.schemaVersion).toBe(1);
    expect(st.moneyPlan).toBeNull();
    expect(st.marketEvents).toBeNull();
  });

  it("统一写入走内存状态，不依赖 localStorage", () => {
    (globalThis as any).window = {
      localStorage: {
        getItem() {
          throw new Error("should not touch localStorage");
        },
      },
      dispatchEvent: () => true,
    };

    saveUnifiedMoneyPlanV1({ id: "u1", name: "Alice" }, { dispatchEvent: false });
    const st = loadUnifiedInputStateV1();

    expect(st.moneyPlan).toEqual({ id: "u1", name: "Alice" });
  });

  it("历史 key 清理函数保留但不再做浏览器存储操作", () => {
    expect(DEPRECATED_STORAGE_KEYS_V1.length).toBeGreaterThan(0);
    expect(cleanupDeprecatedStorageKeysV1()).toEqual([]);
    expect(() => bootstrapUnifiedInputRuntimeV1({ dispatchEvent: false })).not.toThrow();
  });
});
