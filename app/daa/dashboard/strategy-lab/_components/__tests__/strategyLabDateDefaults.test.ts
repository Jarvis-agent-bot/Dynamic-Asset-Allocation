import { describe, expect, it } from "vitest";

import { buildStrategyLabDateDefaults } from "../strategyLabDateDefaults";

describe("buildStrategyLabDateDefaults", () => {
  it("基于同一个服务端时间生成再平衡与突破实验室默认日期", () => {
    const defaults = buildStrategyLabDateDefaults(new Date("2026-05-31T08:30:00.000Z"));

    expect(defaults).toEqual({
      rebalanceStartDate: "2025-05-31",
      rebalanceEndDate: "2026-05-31",
      breakoutStartDate: "2021-05-31",
      breakoutEndDate: "2026-05-31",
    });
  });
});
