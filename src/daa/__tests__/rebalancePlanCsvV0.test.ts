import { describe, expect, it } from "vitest";

import { buildRebalancePlanCsvV0 } from "../rebalancePlanCsvV0";

describe("daa/rebalancePlanCsvV0", () => {
  it("renders allocations + orders with a stable header", () => {
    const csv = buildRebalancePlanCsvV0({
      atIso: "2026-02-13T12:00:00.000Z",
      source: "core:recompute",
      baseCcy: "CNY",
      allocations: [
        { id: "AAA", label: "AAA Fund", currentPct: 0.6, targetPct: 0.5, deltaPct: 0.1 },
        { id: "BBB", label: "BBB", currentPct: 0.4, targetPct: 0.5, deltaPct: -0.1 },
      ],
      orders: [
        { symbol: "AAA", side: "SELL", notional: 123.45, reason: "drift, overweight" },
        { symbol: "BBB", side: "BUY", notional: 123.45, reason: "to target" },
      ],
    });

    expect(csv.startsWith("sep=,\r\n")).toBe(true);
    expect(csv).toContain("type,id,label,current_pct,target_pct,delta_pct,side,notional,reason");
    expect(csv).toContain(",allocation,AAA,AAA Fund,");
    expect(csv).toContain(",order,AAA,AAA Fund,");
  });

  it("escapes commas and quotes in CSV cells", () => {
    const csv = buildRebalancePlanCsvV0({
      atIso: "2026-02-13T12:00:00.000Z",
      allocations: [{ id: "AAA", label: "AAA", currentPct: 0.5, targetPct: 0.5, deltaPct: 0 }],
      orders: [{ symbol: "AAA", side: "BUY", notional: 1, reason: "he said \"ok\", then left" }],
    });

    // Commas or quotes should force quoting with doubled quotes.
    expect(csv).toContain('"he said ""ok"", then left"');
  });
});
