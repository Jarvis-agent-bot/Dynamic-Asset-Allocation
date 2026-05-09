import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { PolicyDecision } from "@/src/daa/modules/policy-engine/policyTypes";
import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";

import { estimateProposalPlanCost } from "./proposalCostModel";

export type ProposalPlan = {
  planId: string;
  policyDecisionId: string;
  proposals: RebalanceProposal[];
  totalNotional: number;
  estimatedCostBase: number;
  expectedTrackingImprovement: number;
  expectedRiskImprovement: number;
};

export function buildProposalPlan(input: {
  policyDecision: PolicyDecision;
  proposals: RebalanceProposal[];
  systemConfig: DaaSystemConfig;
}): ProposalPlan {
  const cost = estimateProposalPlanCost({
    proposals: input.proposals,
    feeRateBps: input.systemConfig.strategy.execution.feeRateBps,
    slippageBps: input.systemConfig.strategy.execution.slippageBps,
  });
  return {
    planId: `plan_${input.policyDecision.decisionId}`,
    policyDecisionId: input.policyDecision.decisionId,
    proposals: input.proposals,
    totalNotional: cost.totalNotional,
    estimatedCostBase: cost.estimatedCostBase,
    expectedTrackingImprovement: input.policyDecision.costBenefit.expectedTrackingImprovement,
    expectedRiskImprovement: input.policyDecision.costBenefit.expectedRiskImprovement,
  };
}
