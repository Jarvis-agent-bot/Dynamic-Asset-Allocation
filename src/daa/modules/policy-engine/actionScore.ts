import type { InvestmentIntent } from "@/src/daa/modules/intents/intentTypes";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";
import type { PortfolioSignal } from "@/src/daa/modules/signals/signalTypes";
import type { RebalanceProposal } from "@/src/daa/modules/workbench/workbenchTypes";

import type { DaaPolicyConfig, PolicyCostBenefit } from "./policyTypes";

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function estimatePolicyCostBenefit(input: {
  portfolioState: PortfolioState;
  policy: DaaPolicyConfig;
  signals: PortfolioSignal[];
  proposals: RebalanceProposal[];
}): PolicyCostBenefit {
  const nav = Math.max(0, input.portfolioState.navBase);
  const totalNotional = input.proposals.reduce((sum, row) => sum + Math.max(0, Number(row.suggestedNotional) || 0), 0);
  const maxDriftPct = input.signals
    .filter((signal) => signal.type === "drift")
    .reduce((max, signal) => Math.max(max, signal.absDriftPct), 0);
  const riskSignalCount = input.signals.filter((signal) => signal.type === "risk" && signal.severity !== "info").length;
  const estimatedCostBase = totalNotional * 0.001;
  return {
    expectedRiskImprovement: Math.min(30, riskSignalCount * 10),
    expectedTrackingImprovement: Math.min(50, maxDriftPct * 5),
    estimatedCostBase,
    turnoverPenalty: nav > 0 ? Math.min(25, (totalNotional / nav) * 100) : 0,
    uncertaintyPenalty: input.portfolioState.dataHealth.status === "ok" ? 0 : 12,
  };
}

export function calculateActionScore(input: {
  portfolioState: PortfolioState;
  policy: DaaPolicyConfig;
  signals: PortfolioSignal[];
  intents: InvestmentIntent[];
  proposals: RebalanceProposal[];
}): {
  score: number;
  costBenefit: PolicyCostBenefit;
} {
  const costBenefit = estimatePolicyCostBenefit({
    portfolioState: input.portfolioState,
    policy: input.policy,
    signals: input.signals,
    proposals: input.proposals,
  });
  const avgConfidence = input.intents.length
    ? input.intents.reduce((sum, row) => sum + row.confidencePct, 0) / input.intents.length
    : 0;
  const hasRiskReductionIntent = input.intents.some((row) => row.source === "risk_reduction");
  const hasAgentIntent = input.intents.some((row) => row.source === "agent_thesis");
  const hasDriftIntent = input.intents.some((row) => row.source === "drift");
  const urgency = hasRiskReductionIntent ? 20 : (hasAgentIntent ? 10 : (hasDriftIntent ? 6 : 0));
  const score = clampScore(
    costBenefit.expectedTrackingImprovement
    + costBenefit.expectedRiskImprovement
    + (avgConfidence * 0.22)
    + urgency
    - costBenefit.turnoverPenalty
    - costBenefit.uncertaintyPenalty,
  );
  return { score, costBenefit };
}

