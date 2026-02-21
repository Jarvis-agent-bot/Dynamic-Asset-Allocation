import { describe, expect, it } from "vitest";

import { buildTargetedDecisionTransparencyV0 } from "../targetedDecisionTransparencyV0";

describe("targeted decision transparency v0", () => {
  it("builds trim rationale with open policy gate", () => {
    const detail = buildTargetedDecisionTransparencyV0({
      rebalanceTableRows: [
        {
          id: "000001",
          label: "Alpha Fund",
          currentPct: 0.4,
          targetPct: 0.3,
          deltaPct: 0.1,
        },
      ],
      driftThresholdPct: 0.02,
      cashBlocked: false,
      liquidityBlocked: false,
      hasBlockingViolation: false,
      resolvePrice: () => ({ price: 1.2345, source: "manual" }),
    });

    expect(detail).toMatchObject({
      symbol: "000001",
      label: "Alpha Fund",
      policyGate: true,
      cashGate: true,
      liquidityGate: true,
      violationsGate: true,
      price: 1.2345,
      priceSource: "manual",
    });
    expect(detail?.rationale).toContain("Trim");
  });

  it("builds add rationale and blocked note when gates are blocked", () => {
    const detail = buildTargetedDecisionTransparencyV0({
      rebalanceTableRows: [
        {
          id: "000002",
          label: "Beta Fund",
          currentPct: 0.1,
          targetPct: 0.2,
          deltaPct: -0.1,
        },
      ],
      driftThresholdPct: 0.02,
      cashBlocked: true,
      liquidityBlocked: true,
      hasBlockingViolation: true,
      resolvePrice: () => ({ price: null, source: "missing" }),
    });

    expect(detail).toMatchObject({
      policyGate: true,
      cashGate: false,
      liquidityGate: false,
      violationsGate: false,
    });
    expect(detail?.rationale).toContain("Add");
    expect(detail?.rationale).toContain("blocked until cash/settlement gate clears");
  });

  it("returns null when rows are empty", () => {
    const detail = buildTargetedDecisionTransparencyV0({
      rebalanceTableRows: [],
      driftThresholdPct: 0.02,
      cashBlocked: false,
      liquidityBlocked: false,
      hasBlockingViolation: false,
      resolvePrice: () => ({ price: null, source: "missing" }),
    });

    expect(detail).toBeNull();
  });
});
