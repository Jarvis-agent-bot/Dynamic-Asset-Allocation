import { describe, expect, it } from "vitest";

import { validateMoneyPlan } from "../money";

describe("validateMoneyPlan", () => {
  it("accepts a minimal sane plan (sum(targetPct) <= 1)", () => {
    const issues = validateMoneyPlan({
      account: { baseCcy: "USD", totalEquity: 100, cash: 10, investable: 80 },
      constraints: { maxPositionPct: 0.5, maxIn: 0, maxOut: 0 },
      allocations: [
        { id: "core", label: "Core", targetPct: 0.6 },
        { id: "def", label: "Defensive", targetPct: 0.2 },
      ],
    });

    expect(issues).toEqual([]);
  });

  it("flags sum(targetPct) > 1", () => {
    const issues = validateMoneyPlan({
      account: { baseCcy: "USD", totalEquity: 100, cash: 10, investable: 80 },
      constraints: { maxPositionPct: 0.5, maxIn: 0, maxOut: 0 },
      allocations: [
        { id: "a", label: "A", targetPct: 0.8 },
        { id: "b", label: "B", targetPct: 0.3 },
      ],
    });

    expect(issues.some((x) => x.path === "allocations")).toBe(true);
  });

  it("flags invalid account + constraints", () => {
    const issues = validateMoneyPlan({
      account: { baseCcy: "", totalEquity: 0, cash: -1, investable: 200 },
      constraints: { maxPositionPct: 2, maxIn: -1, maxOut: -1 },
      allocations: [],
    });

    const paths = issues.map((x) => x.path);
    expect(paths).toContain("account.baseCcy");
    expect(paths).toContain("account.totalEquity");
    expect(paths).toContain("account.cash");
    expect(paths).toContain("account.investable");
    expect(paths).toContain("constraints.maxPositionPct");
    expect(paths).toContain("constraints.maxIn");
    expect(paths).toContain("constraints.maxOut");
  });
});
