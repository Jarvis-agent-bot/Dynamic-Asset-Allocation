import { normalizeDaaCurrencyCodeV1, normalizeDaaSymbolV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import type { DaaMarketContextV1, DaaMarketRegimeV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";
import { getStrategyExecutionConfigV2 } from "@/src/daa/config/systemConfigV2";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { runLlmDecisionV2 } from "@/src/daa/llm/llmDecisionV2";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/decision/decisionResultTypesV2";
import {
  buildMarketContextAttributionV1,
  getCurrentMarketContextV1,
  marketRegimeLabelZhV1,
} from "@/src/daa/modules/marketContext/marketIndicatorServiceV1";
import { classifyCashV2 } from "./cashClassificationV2";
import { fuseDecisionV2 } from "./decisionFusionV2";
import {
  appendDaaTriggerEventV1,
  appendDaaRunHistoryV1,
  appendAssetPriceHistoryRowsV1,
  createDaaRebalanceCycleV1,
  createDaaRebalanceDecisionV1,
  createDaaTradeTicketV1,
  executeDaaTradeTicketsV1,
  getDaaCycleReportV1,
  getDaaHumanIngestStateV1,
  getDaaRebalanceCycleV1,
  getDaaSystemConfigV2,
  getDaaMarketCacheHealthStatsV1,
  listDaaAssetUniverseV1,
  listDaaCycleReportsV1,
  listDaaEquitySnapshotsV1,
  listDaaFxRatesV1,
  listDaaRebalanceCyclesV1,
  listDaaTradeTicketsV1,
  patchDaaRebalanceCycleV1,
  upsertDaaCycleReportV1,
  updateDaaAssetUniverseLastPriceV1,
  type DaaStoreRebalanceCycleV1,
} from "@/src/daa/store/daaStorePgV1";
import { buildDaaUnifiedPlanV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import {
  buildFxLookupToBaseV1,
  summarizeMarkToMarketPortfolioV1,
} from "@/src/daa/modules/portfolio/portfolioValuationV1";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";

import { buildAssetUniverseViewRowsV1 } from "./assetUniverseServiceV1";
import type {
  ExecuteRebalanceSummaryV1,
  ExecuteRebalanceCycleResultV1,
  GenerateRebalanceCycleInputV1,
  GenerateRebalanceCycleResultV1,
  HfSignalSummaryV1,
  PortfolioHealthyInsightV1,
  PreTradeRiskCheckItemV1,
  PreTradeRiskCheckV1,
  RebalanceCycleV1,
  RebalanceProposalV1,
  RebalanceTriggerSourceV1,
  UpdateRebalanceCycleInputV1,
  WorkbenchBootstrapV1,
  WorkbenchRebalanceCycleReportV1,
  WorkbenchRecommendationV1,
  WorkbenchRecommendationsResultV1,
  WorkbenchTradeRecordsV1,
} from "./workbenchTypesV1";

import { buildWorkbenchBootstrapV1 } from "./workbenchReadServiceV1";
import {
  assertCycleExecutableV1,
  buildCycleDraftFromBootstrapV1,
  buildManualPreTradeRiskCheckV1,
  buildPreTradeRiskCheckFromBootstrapV1,
  normalizeExecutionLogFiltersV1,
  normalizeReasonTagsV1,
  normalizeText,
  normalizeTradeSideV1,
  toFinite,
} from "./workbenchSharedV1";

export async function runWorkbenchRiskCheckV1(input?: {
  cycleId?: string;
  selectedSymbols?: string[];
}): Promise<PreTradeRiskCheckV1> {
  const [bootstrap, systemRow, cycle] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false }),
    getDaaSystemConfigV2(),
    input?.cycleId ? getDaaRebalanceCycleV1(input.cycleId) : Promise.resolve(null),
  ]);

  const selectedSet = new Set((input?.selectedSymbols || []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
  const proposals = cycle
    ? cycle.proposals.filter((row) => {
      if (!selectedSet.size) return true;
      return selectedSet.has(row.symbol.toUpperCase());
    })
    : buildCycleDraftFromBootstrapV1({ bootstrap }).proposals;

  return buildPreTradeRiskCheckFromBootstrapV1({
    bootstrap,
    systemConfig: systemRow.config,
    proposals,
  });
}

export async function validateExecutionRiskV1(input: {
  cycleId?: string;
  selectedSymbols?: string[];
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
}): Promise<PreTradeRiskCheckV1> {
  if (input.cycleId) {
    return runWorkbenchRiskCheckV1({
      cycleId: input.cycleId,
      selectedSymbols: input.selectedSymbols,
    });
  }
  const manualProposal = input.manualProposal;
  if (!manualProposal) {
    return runWorkbenchRiskCheckV1();
  }

  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false }),
    getDaaSystemConfigV2(),
  ]);

  const proposal: RebalanceProposalV1 = {
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

  return buildManualPreTradeRiskCheckV1({
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
}

export async function buildWorkbenchExecuteSummaryV1(input: {
  cycleId: string;
  executeMode: "selected" | "all";
}): Promise<ExecuteRebalanceSummaryV1> {
  const cycle = await getDaaRebalanceCycleV1(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);
  assertCycleExecutableV1(cycle, "summary");
  const [bootstrap, systemRow] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false }),
    getDaaSystemConfigV2(),
  ]);
  const rows = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  const feeRateBps = getStrategyExecutionConfigV2(systemRow.config).feeRateBps;
  const feeRate = feeRateBps / 10000;
  const buyNotional = rows.filter((row) => row.side === "BUY").reduce((sum, row) => sum + row.suggestedNotional, 0);
  const sellNotional = rows.filter((row) => row.side === "SELL").reduce((sum, row) => sum + row.suggestedNotional, 0);
  const estimatedFees = rows.reduce((sum, row) => sum + (row.suggestedQty * row.price * feeRate), 0);
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

  const riskCheck = await validateExecutionRiskV1({
    cycleId: cycle.cycleId,
    selectedSymbols: rows.map((row) => row.symbol),
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



export { normalizeExecutionLogFiltersV1, normalizeReasonTagsV1, normalizeTradeSideV1 } from "./workbenchSharedV1";
