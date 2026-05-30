import { describe, expect, it } from "vitest";

import { formatStrategyLabCurrencyTick, formatStrategyLabCurrencyTooltipValue } from "../strategyLabMoneyFormat";

describe("strategyLabMoneyFormat", () => {
  it("根据基准货币格式化坐标轴金额", () => {
    expect(formatStrategyLabCurrencyTick(100000, "USD")).toBe("$100,000");
    expect(formatStrategyLabCurrencyTick(100000, "HKD")).toBe("HK$100,000");
    expect(formatStrategyLabCurrencyTick(100000, "USD")).not.toBe(formatStrategyLabCurrencyTick(100000, "HKD"));
  });

  it("tooltip 金额不再硬编码为美元", () => {
    expect(formatStrategyLabCurrencyTooltipValue(1234.56, "CNY")).toContain("¥");
    expect(formatStrategyLabCurrencyTooltipValue(undefined, "HKD")).toBe("HK$0");
  });
});
