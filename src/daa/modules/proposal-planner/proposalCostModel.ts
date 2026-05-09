import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";

export function estimateProposalPlanCost(input: {
  proposals: RebalanceProposal[];
  feeRateBps: number;
  slippageBps: number;
}): {
  totalNotional: number;
  estimatedFeeBase: number;
  estimatedSlippageBase: number;
  estimatedCostBase: number;
} {
  const totalNotional = input.proposals.reduce((sum, row) => sum + Math.max(0, Number(row.suggestedNotional) || 0), 0);
  const estimatedFeeBase = totalNotional * Math.max(0, input.feeRateBps) / 10_000;
  const estimatedSlippageBase = totalNotional * Math.max(0, input.slippageBps) / 10_000;
  return {
    totalNotional,
    estimatedFeeBase,
    estimatedSlippageBase,
    estimatedCostBase: estimatedFeeBase + estimatedSlippageBase,
  };
}
