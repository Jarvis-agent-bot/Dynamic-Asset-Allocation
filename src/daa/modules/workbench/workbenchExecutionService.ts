import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import {
  getDaaRebalanceCycle,
  getDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";
import type {
  ExecuteRebalanceSummary,
  PreTradeRiskCheck,
  RebalanceProposal,
} from "./workbenchTypes";

import { buildWorkbenchBootstrap } from "./workbenchReadService";
import {
  assertCycleExecutable,
  buildCycleDraftFromBootstrap,
  buildManualPreTradeRiskCheck,
  buildPreTradeRiskCheckFromBootstrap,
  enrichRiskCheckWithCorrelation,
  normalizeText,
  toFinite,
} from "./workbenchShared";

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
  executeMode: "selected" | "all";
}): Promise<ExecuteRebalanceSummary> {
  const cycle = await getDaaRebalanceCycle(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);
  assertCycleExecutable(cycle, "summary");
  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false }),
    getDaaSystemConfig(),
  ]);
  const rows = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  const feeRateBps = getStrategyExecutionConfig(systemRow.config).feeRateBps;
  const feeRate = feeRateBps / 10000;
  const buyNotional = rows.filter((row) => row.side === "BUY").reduce((sum, row) => sum + row.suggestedNotional, 0);
  const sellNotional = rows.filter((row) => row.side === "SELL").reduce((sum, row) => sum + row.suggestedNotional, 0);
  const estimatedFees = rows.reduce((sum, row) => sum + (row.suggestedNotional * feeRate), 0);
  const netCashImpact = sellNotional - buyNotional - estimatedFees;

  const totalEquity = Math.max(1e-9, toFinite(bootstrap.account.totalEquity, 0));
  const valuationBySymbol = new Map<string, number>();
  for (const row of bootstrap.assetUniverse) {
    valuationBySymbol.set(row.symbol.toUpperCase(), Math.max(0, toFinite(row.valuationBase, 0)));
  }
  const touched = new Set(rows.map((row) => row.symbol.toUpperCase()));
  const topWeightChanges = [...touched].map((symbol) => {
    const currentValue = valuationBySymbol.get(symbol) || 0;
    const delta = rows
      .filter((row) => row.symbol.toUpperCase() === symbol)
      .reduce((sum, row) => sum + (row.side === "BUY" ? row.suggestedNotional : -row.suggestedNotional), 0);
    const projectedValue = Math.max(0, currentValue + delta);
    const currentWeightPct = (currentValue / totalEquity) * 100;
    const projectedWeightPct = (projectedValue / totalEquity) * 100;
    return {
      symbol,
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
    buyNotional,
    sellNotional,
    estimatedFees,
    netCashImpact,
    topWeightChanges,
    riskWarnings,
    riskOverallStatus: riskCheck.overallStatus,
  };
}
