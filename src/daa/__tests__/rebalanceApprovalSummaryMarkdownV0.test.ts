import { describe, expect, it } from "vitest";

import type { RebalanceWhatIfV0 } from "../../core/rebalanceWhatIf";
import type { RebalanceViolationV0 } from "../rebalanceViolationsV0";

import { buildRebalanceApprovalSummaryMarkdownV0 } from "../rebalanceApprovalSummaryMarkdownV0";

describe("rebalance approval summary markdown (v0)", () => {
  it("includes orders, costs, and constraints sections", () => {
    const orders = [
      { symbol: "AAA", side: "SELL" as const, notional: 100, reason: "reduce drift" },
      { symbol: "BBB", side: "BUY" as const, notional: 100, reason: "increase target" },
    ];

    const whatIf: RebalanceWhatIfV0 = {
      schemaVersion: 1,
      feeBps: 10,
      slippageBps: 25,

      buyNotional: 100,
      sellNotional: 100,
      turnoverNotional: 200,
      turnoverPctOfTotalBefore: 0.2,

      costPct: 0.0035,
      feeTotal: 0.2,
      slippageTotal: 0.5,
      costTotal: 0.7,

      feeBuyTotal: 0.1,
      feeSellTotal: 0.1,
      slippageBuyTotal: 0.25,
      slippageSellTotal: 0.25,
      costBuyTotal: 0.35,
      costSellTotal: 0.35,

      buyCashOutflow: 100,
      sellProceedsGross: 100,
      sellProceedsNet: 99.65,
      cashDelta: -0.35,

      totalBefore: 1000,
      totalAfter: 999.3,
      cashBefore: 100,
      cashAfter: 99.65,
      warnings: [],
      rows: [],
    };

    const violations: RebalanceViolationV0[] = [
      {
        level: "blocker",
        kind: "cashSettlement",
        title: "Pre-trade cash/settlement check (BLOCKED)",
        details: ["insufficient cash"],
      },
      {
        level: "warning",
        kind: "minTrade",
        title: "Min trade warnings",
        details: ["below min"],
        suggestion: "lower minTrade",
      },
    ];

    const md = buildRebalanceApprovalSummaryMarkdownV0({
      atIso: "2026-02-14T00:00:00.000Z",
      action: "dynamic-rebalance",
      baseCcy: "USD",
      scheduleEnabled: true,
      executionMode: "dry-run",
      feeBps: 10,
      slippageBpsBase: 10,
      slippageSensitivity: 2,
      slippageBpsEffective: 20,
      sellProceedsRouting: "CASH",
      overrideBlockers: false,
      orders,
      whatIf,
      violations,
    });

    expect(md).toContain("# Rebalance run approval summary (v0)");
    expect(md).toContain("## Constraints / validation");
    expect(md).toContain("blockers=1; warnings=1");
    expect(md).toContain("## Costs (estimated)");
    expect(md).toContain("turnover≈200.00 USD");
    expect(md).toContain("totalCost≈0.70 USD");
    expect(md).toContain("## Orders");
    expect(md).toContain("| AAA | SELL | 100.00 | reduce drift |");
    expect(md).toContain("```json");
  });
});
