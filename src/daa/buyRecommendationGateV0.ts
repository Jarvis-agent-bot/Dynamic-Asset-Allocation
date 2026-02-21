export type BuyRecommendationGateTierV0 = "elite" | "neutral" | "incompetent";

export type BuyRecommendationGateInputV0 = {
  analystTier: BuyRecommendationGateTierV0;
  managerTier: BuyRecommendationGateTierV0;
  hasLockedMaxIn: boolean;
  liquiditySettlementBlocked: boolean;
};

export type BuyRecommendationGateResultV0 = {
  pass: boolean;
  nonIncompetentTagPass: boolean;
  maxInNotLockedPass: boolean;
  liquiditySettlementPass: boolean;
  blockers: Array<"non-incompetent-tag" | "maxin-locked" | "liquidity-t+n-gate">;
};

export function getBuyRecommendationGateV0(input: BuyRecommendationGateInputV0): BuyRecommendationGateResultV0 {
  const nonIncompetentTagPass = input.analystTier !== "incompetent" && input.managerTier !== "incompetent";
  const maxInNotLockedPass = !input.hasLockedMaxIn;
  const liquiditySettlementPass = !input.liquiditySettlementBlocked;
  const blockers: BuyRecommendationGateResultV0["blockers"] = [];

  if (!nonIncompetentTagPass) blockers.push("non-incompetent-tag");
  if (!maxInNotLockedPass) blockers.push("maxin-locked");
  if (!liquiditySettlementPass) blockers.push("liquidity-t+n-gate");

  return {
    pass: blockers.length === 0,
    nonIncompetentTagPass,
    maxInNotLockedPass,
    liquiditySettlementPass,
    blockers,
  };
}
