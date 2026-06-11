import { describe, expect, it } from "vitest";

import {
  validateExchangeCalendarMaintenance,
} from "@/src/daa/marketSession/exchangeCalendarMaintenance";

describe("exchange-calendar-maintenance", () => {
  it("确认当前交易所日历覆盖要求年份", () => {
    const result = validateExchangeCalendarMaintenance({
      requiredMarkets: ["US", "HK", "CRYPTO"],
      requiredYears: [2026],
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("发现缺失年份时返回可操作问题", () => {
    const result = validateExchangeCalendarMaintenance({
      requiredMarkets: ["US", "HK"],
      requiredYears: [2027],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("US 缺少 2027");
    expect(result.issues.join("\n")).toContain("HK 缺少 2027");
  });
});
