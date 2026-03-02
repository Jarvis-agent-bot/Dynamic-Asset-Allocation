import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapUnifiedInputRuntimeV1,
  loadUnifiedInputStateV1,
  writeUnifiedInputSliceV1,
} from "../../../app/daa/unifiedInputStore";

afterEach(() => {
  delete (globalThis as any).__daa_unified_input_state_v1__;
});

describe("unifiedInputStore v1", () => {
  it("启动时返回默认内存态", () => {
    const st = loadUnifiedInputStateV1();

    expect(st.schemaVersion).toBe(1);
    expect(st.positions).toBeNull();
    expect(st.strategyConfig).toBeNull();
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

    writeUnifiedInputSliceV1("positions", [{ symbol: "SPY", market: "US", currency: "USD", qty: 2, price: 600, tags: [] }], { dispatchEvent: false });
    const st = loadUnifiedInputStateV1();

    expect(st.positions).toEqual([{ symbol: "SPY", market: "US", currency: "USD", qty: 2, price: 600, tags: [] }]);
  });

  it("运行时引导只维护内存态，不触达浏览器存储", () => {
    expect(() => bootstrapUnifiedInputRuntimeV1({ dispatchEvent: false })).not.toThrow();
  });
});
