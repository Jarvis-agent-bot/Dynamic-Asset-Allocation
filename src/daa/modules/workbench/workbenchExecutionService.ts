import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import {
  getDaaRebalanceCycle,
  getDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";
import { normalizeText, toFinite } from "@/src/daa/utils/normalize";
import type {
  ExecuteRebalanceSummary,
  PreTradeRiskCheck,
  RebalanceProposal,
} from "./workbenchTypes";
import type { RebalanceExecuteMode } from "./rebalanceExecuteMode";

import { buildWorkbenchBootstrap } from "./workbenchReadService";
import { assertCycleExecutable } from "./cycleGuards";
import { summarizeProposalExecutionCosts } from "./executionCost";
import {
  buildCycleDraftFromBootstrap,
  buildManualPreTradeRiskCheck,
  buildPreTradeRiskCheckFromBootstrap,
  enrichRiskCheckWithCorrelation,
} from "./workbenchModeling";

export async function runWorkbenchRiskCheck(input?: {
  cycleId?: string;
  selectedAssetSideKeys?: string[];
}): Promise<PreTradeRiskCheck> {
  const [bootstrap, systemRow, cycle] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false }),
    getDaaSystemConfig(),
    input?.cycleId ? getDaaRebalanceCycle(input.cycleId) : Promise.resolve(null),
  ]);

  const selectedSet = new Set((input?.selectedAssetSideKeys || []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
  const proposals = cycle
    ? cycle.proposals.filter((row) => {
      if (!selectedSet.size) return true;
      return selectedSet.has(`${row.assetKey.toUpperCase()}::${row.side.toUpperCase()}`);
    })
    : buildCycleDraftFromBootstrap({ bootstrap }).proposals;

  const baseRiskCheck = buildPreTradeRiskCheckFromBootstrap({
    bootstrap,
    systemConfig: systemRow.config,
    proposals,
  });
  return enrichRiskCheckWithCorrelation(
    baseRiskCheck,
    bootstrap.assetUniverse,
    systemRow.config.strategy.risk.correlationCapPct,
  );
}

export async function validateExecutionRisk(input: {
  cycleId?: string;
  selectedAssetSideKeys?: string[];
  manualProposal?: {
    assetKey: string;
    symbol: string;
    currency: string;
    side: "BUY" | "SELL";
    suggestedQty: number;
    suggestedNotional: number;
    price: number;
    reason?: string;
  };
}): Promise<PreTradeRiskCheck> {
  if (input.cycleId) {
    return runWorkbenchRiskCheck({
      cycleId: input.cycleId,
      selectedAssetSideKeys: input.selectedAssetSideKeys,
    });
  }
  const manualProposal = input.manualProposal;
  if (!manualProposal) {
    return runWorkbenchRiskCheck();
  }

  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false }),
    getDaaSystemConfig(),
  ]);

  const proposal: RebalanceProposal = {
    assetKey: manualProposal.assetKey,
    symbol: manualProposal.symbol,
    currency: manualProposal.currency,
    fxRateToBase: bootstrap.assetUniverse.find((row) => row.assetKey === manualProposal.assetKey)?.fxRateToBase ?? null,
    side: manualProposal.side,
    suggestedQty: Math.max(0, toFinite(manualProposal.suggestedQty, 0)),
    suggestedNotional: Math.max(0, toFinite(manualProposal.suggestedNotional, 0)),
    price: Math.max(0, toFinite(manualProposal.price, 0)),
    reason: normalizeText(manualProposal.reason) || "manual_execution",
    selected: true,
    hfContribution: null,
  };

  const baseRiskCheck = buildManualPreTradeRiskCheck({
    assetUniverse: bootstrap.assetUniverse,
    proposal,
    totalEquity: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    constraints: {
      maxPositionPct: systemRow.config.strategy.constraints.maxPositionPct,
      maxOrderPctOfNav: systemRow.config.strategy.constraints.maxOrderPctOfNav,
    },
    risk: {
      perAssetStopLossPct: systemRow.config.strategy.risk.perAssetStopLossPct,
      maxConcentrationPct: systemRow.config.strategy.risk.maxConcentrationPct,
    },
  });
  return enrichRiskCheckWithCorrelation(
    baseRiskCheck,
    bootstrap.assetUniverse,
    systemRow.config.strategy.risk.correlationCapPct,
  );
}

export async function buildWorkbenchExecuteSummary(input: {
  cycleId: string;
  executeMode: RebalanceExecuteMode;
}): Promise<ExecuteRebalanceSummary> {
  const cycle = await getDaaRebalanceCycle(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);
  assertCycleExecutable(cycle, "summary");
  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false }),
    getDaaSystemConfig(),
  ]);
  const rows = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  const executionConfig = getStrategyExecutionConfig(systemRow.config);
  const costSummary = summarizeProposalExecutionCosts({
    proposals: rows,
    feeRateBps: executionConfig.feeRateBps,
    slippageBps: executionConfig.slippageBps,
  });

  const totalEquity = Math.max(1e-9, toFinite(bootstrap.account.totalEquity, 0));
  const valuationByAssetKey = new Map<string, number>();
  const symbolByAssetKey = new Map<string, string>();
  for (const row of bootstrap.assetUniverse) {
    valuationByAssetKey.set(row.assetKey.toUpperCase(), Math.max(0, toFinite(row.valuationBase, 0)));
    symbolByAssetKey.set(row.assetKey.toUpperCase(), row.symbol);
  }
  const assetDeltaByKey = new Map<string, number>();
  for (const row of costSummary.estimates) {
    const key = row.assetKey.toUpperCase();
    assetDeltaByKey.set(key, (assetDeltaByKey.get(key) || 0) + row.assetValueDeltaBase);
  }
  const topWeightChanges = [...assetDeltaByKey.entries()].map(([assetKey, delta]) => {
    const currentValue = valuationByAssetKey.get(assetKey) || 0;
    const projectedValue = Math.max(0, currentValue + delta);
    const currentWeightPct = (currentValue / totalEquity) * 100;
    const projectedWeightPct = (projectedValue / totalEquity) * 100;
    return {
      symbol: symbolByAssetKey.get(assetKey) || assetKey,
      currentWeightPct,
      projectedWeightPct,
      changePct: projectedWeightPct - currentWeightPct,
    };
  }).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);

  const riskCheck = await validateExecutionRisk({
    cycleId: cycle.cycleId,
    selectedAssetSideKeys: rows.map((row) => `${row.assetKey}::${row.side}`),
  });
  const riskWarnings = riskCheck.items
    .filter((item) => item.status !== "pass")
    .map((item) => item.message);

  return {
    cycleId: cycle.cycleId,
    executeMode: input.executeMode,
    orderCount: rows.length,
    buyNotional: costSummary.buyNotional,
    sellNotional: costSummary.sellNotional,
    estimatedFees: costSummary.estimatedFees,
    netCashImpact: costSummary.netCashImpact,
    topWeightChanges,
    riskWarnings,
    riskOverallStatus: riskCheck.overallStatus,
  };
}
