import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getBuyRecommendationGateV0 } from "../buyRecommendationGateV0";

describe("buy recommendation gate v0", () => {
  it("passes only when non-incompetent tags, maxIn unlocked, and liquidity/T+N gate pass", () => {
    const result = getBuyRecommendationGateV0({
      analystTier: "neutral",
      managerTier: "elite",
      hasLockedMaxIn: false,
      liquiditySettlementBlocked: false,
    });

    expect(result).toEqual({
      pass: true,
      nonIncompetentTagPass: true,
      maxInNotLockedPass: true,
      liquiditySettlementPass: true,
      blockers: [],
    });
  });

  it("blocks buy recommendations when any hard gate fails", () => {
    const result = getBuyRecommendationGateV0({
      analystTier: "incompetent",
      managerTier: "neutral",
      hasLockedMaxIn: true,
      liquiditySettlementBlocked: true,
    });

    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(["non-incompetent-tag", "maxin-locked", "liquidity-t+n-gate"]);
  });

  it("wires gate status into maintainability cards copy", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanelMaintainabilityCardsV0.tsx"),
      "utf8",
    );

    expect(source).toContain("Buy recommendation gate + liquidity caps");
    expect(source).toContain("Buy recommendations must pass non-incompetent tag, MaxIn unlock, and liquidity/T+N gate before routing.");
    expect(source).toContain("const buyRecommendationGate = getBuyRecommendationGateV0({");
    expect(source).toContain("blocked reasons: {buyRecommendationGate.blockers.join(', ')}");
  });
});
