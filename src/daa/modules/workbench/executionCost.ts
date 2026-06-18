import { toFinite } from "@/src/daa/utils/normalize";
import type { WorkbenchBootstrap } from "./workbenchTypes";
import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";

export function calcHoldingCostPerUnit(row: Pick<WorkbenchBootstrap["assetUniverse"][number], "holdingQty" | "costBasis" | "holdingPrice">): number {
  if (row.holdingQty > 0 && row.costBasis != null && row.costBasis > 0) {
    return row.costBasis / row.holdingQty;
  }
  if (row.holdingPrice > 0) return row.holdingPrice;
  return 0;
}

export function calcHoldingCostPerUnitBase(
  row: Pick<WorkbenchBootstrap["assetUniverse"][number], "holdingQty" | "costBasis" | "costBasisInBase" | "holdingPrice" | "fxRateToBase">,
): number {
  if (row.holdingQty > 0 && row.costBasisInBase != null && row.costBasisInBase > 0) {
    return row.costBasisInBase / row.holdingQty;
  }
  const fx = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : 1;
  return calcHoldingCostPerUnit(row) * fx;
}

export function estimateProposalExecutionCost(input: {
  proposal: Pick<RebalanceProposal, "assetKey" | "symbol" | "side" | "suggestedNotional">;
  feeRateBps?: number;
  slippageBps?: number;
}) {
  const feeRate = Math.max(0, toFinite(input.feeRateBps, 0)) / 10_000;
  const slippageRate = Math.max(0, toFinite(input.slippageBps, 0)) / 10_000;
  const baseNotional = Math.max(0, toFinite(input.proposal.suggestedNotional, 0));
  const slippageMultiplier = input.proposal.side === "BUY"
    ? (1 + slippageRate)
    : Math.max(0, 1 - slippageRate);
  const grossNotionalBase = baseNotional * slippageMultiplier;
  const feeBase = grossNotionalBase * feeRate;
  const assetValueDeltaBase = input.proposal.side === "BUY"
    ? grossNotionalBase
    : -grossNotionalBase;
  const netCashImpactBase = input.proposal.side === "BUY"
    ? -(grossNotionalBase + feeBase)
    : (grossNotionalBase - feeBase);
  return {
    assetKey: input.proposal.assetKey,
    symbol: input.proposal.symbol,
    side: input.proposal.side,
    baseNotional,
    grossNotionalBase,
    feeBase,
    assetValueDeltaBase,
    netCashImpactBase,
  };
}

export function summarizeProposalExecutionCosts(input: {
  proposals: Array<Pick<RebalanceProposal, "assetKey" | "symbol" | "side" | "suggestedNotional">>;
  feeRateBps?: number;
  slippageBps?: number;
}) {
  const estimates = input.proposals.map((proposal) => estimateProposalExecutionCost({
    proposal,
    feeRateBps: input.feeRateBps,
    slippageBps: input.slippageBps,
  }));
  const buyNotional = estimates
    .filter((row) => row.side === "BUY")
    .reduce((sum, row) => sum + row.grossNotionalBase, 0);
  const sellNotional = estimates
    .filter((row) => row.side === "SELL")
    .reduce((sum, row) => sum + row.grossNotionalBase, 0);
  const estimatedFees = estimates.reduce((sum, row) => sum + row.feeBase, 0);
  const netCashImpact = estimates.reduce((sum, row) => sum + row.netCashImpactBase, 0);
  return {
    estimates,
    buyNotional,
    sellNotional,
    estimatedFees,
    netCashImpact,
  };
}
