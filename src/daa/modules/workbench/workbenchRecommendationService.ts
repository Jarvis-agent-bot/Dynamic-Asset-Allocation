import { normalizeDaaCurrencyCode, normalizeDaaSymbol, parseDaaAssetKey } from "@/src/daa/assetKey";
import type { DaaMarketContext, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { runLlmAnalysis } from "@/src/daa/llm/llmAnalysis";
import { runLlmDecision } from "@/src/daa/llm/llmDecision";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";
import { hydrateUnifiedRequestWithSignals } from "@/src/daa/modules/decision/hydrateUnifiedRequest";
import type { UnifiedDecisionResult } from "@/src/daa/modules/decision/decisionResultTypes";
import {
  buildMarketContextAttribution,
  getCurrentMarketContext,
  marketRegimeLabelZh,
} from "@/src/daa/modules/marketContext/marketIndicatorService";
import { classifyCash } from "./cashClassification";
import { fuseDecision } from "./decisionFusion";
import {
  appendDaaTriggerEvent,
  appendDaaRunHistory,
  appendAssetPriceHistoryRows,
  createDaaRebalanceCycle,
  createDaaRebalanceDecision,
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaCycleReport,
  getDaaHumanIngestState,
  getDaaRebalanceCycle,
  getDaaSystemConfig,
  getDaaMarketCacheHealthStats,
  listDaaAssetUniverse,
  listDaaCycleReports,
  listDaaEquitySnapshots,
  listDaaFxRates,
  listDaaRebalanceCycles,
  listDaaTradeTickets,
  patchDaaRebalanceCycle,
  upsertDaaCycleReport,
  updateDaaAssetUniverseLastPrice,
  type DaaStoreRebalanceCycle,
} from "@/src/daa/store/daaStorePg";
import { buildDaaUnifiedPlan, type DaaUnifiedRequest } from "@/src/daa/unifiedRebalance";
import {
  buildFxLookupToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";

import { buildAssetUniverseViewRows } from "./assetUniverseService";
import type {
  ExecuteRebalanceSummary,
  ExecuteRebalanceCycleResult,
  GenerateRebalanceCycleInput,
  GenerateRebalanceCycleResult,
  HfSignalSummary,
  PortfolioHealthyInsight,
  PreTradeRiskCheckItem,
  PreTradeRiskCheck,
  RebalanceCycle,
  RebalanceProposal,
  RebalanceTriggerSource,
  UpdateRebalanceCycleInput,
  WorkbenchBootstrap,
  WorkbenchRebalanceCycleReport,
  WorkbenchRecommendation,
  WorkbenchRecommendationsResult,
  WorkbenchTradeRecords,
} from "./workbenchTypes";

import { buildUnifiedRequestFromStore } from "./workbenchReadService";
import {
  buildBlockedReasons,
  buildRecommendationRows,
  mapOpportunityActionLabelZh,
  normalizeText,
  summarizeOpportunityReasonZh,
} from "./workbenchShared";

export async function runWorkbenchRecommendations(input: {
  analysisFocus?: string;
  triggerSource?: "manual" | "cron_scheduled";
}): Promise<WorkbenchRecommendationsResult> {
  const analysisFocus = normalizeText(input.analysisFocus) || DEFAULT_ANALYSIS_FOCUS_;
  const triggerSource = input.triggerSource === "cron_scheduled" ? "cron_scheduled" : "manual";
  const { request, assetRows } = await buildUnifiedRequestFromStore();
  const hydrated = await hydrateUnifiedRequestWithSignals(request);
  const plan = buildDaaUnifiedPlan(hydrated.request);
  let marketContext: DaaMarketContext | null = null;
  try {
    marketContext = await getCurrentMarketContext({ allowStale: true });
  } catch {
    marketContext = null;
  }

  const llmAnalysis = await runLlmAnalysis({
    analysisContext: "decision",
    baseCurrency: plan.summary.baseCurrency,
    shouldRebalance: plan.summary.shouldRebalance,
    analysisFocus,
    opportunities: hydrated.opportunityPanel.opportunities.map((item) => ({
      symbol: item.symbol,
      finalScorePct: item.finalScorePct,
      confidencePct: item.confidencePct,
      riskScorePct: item.riskScorePct,
      action: item.action,
      reasons: item.reasons,
    })),
    warnings: plan.warnings,
    marketContext,
  });

  const decisionResult: UnifiedDecisionResult = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plan,
    opportunityPanel: hydrated.opportunityPanel,
    hydrationDiagnostics: hydrated.diagnostics,
    llmAnalysis,
  };

  const created = await createDaaRebalanceDecision({
    requestJson: hydrated.request as unknown as Record<string, unknown>,
    responseJson: decisionResult as unknown as Record<string, unknown>,
    shouldRebalance: Boolean(plan.summary.shouldRebalance),
    triggerSource,
  });

  const decisionId = created.decision.id;
  const decisionStatus = created.decision.status;

  try {
    await appendDaaRunHistory({
      requestJson: hydrated.request as unknown as Record<string, unknown>,
      responseJson: {
        ...decisionResult,
        decisionId,
        decisionStatus,
      } as Record<string, unknown>,
      summaryJson: {
        ...(plan.summary as unknown as Record<string, unknown>),
        decisionId,
        decisionStatus,
        fusionWeights: hydrated.opportunityPanel.diagnostics.weights,
      },
      triggerSource,
    });
  } catch {
    // 运行历史记录失败不阻塞结果返回
  }

  return {
    decisionId,
    decisionStatus,
    summary: {
      shouldRebalance: plan.summary.shouldRebalance,
      executableOrderCount: plan.summary.executableOrderCount,
      blockedOrderCount: plan.summary.blockedOrderCount,
      totalEquity: plan.summary.totalEquity,
      baseCurrency: plan.summary.baseCurrency,
    },
    recommendations: buildRecommendationRows({
      result: decisionResult,
      decisionId,
      assetRows,
    }),
    blockedReasons: buildBlockedReasons(decisionResult),
    warnings: [...plan.warnings],
    insightDigest: {
      topOpportunities: hydrated.opportunityPanel.opportunities.slice(0, 5).map((item) => ({
        symbol: item.symbol,
        action: item.action,
        actionLabelZh: mapOpportunityActionLabelZh(item.action),
        finalScorePct: item.finalScorePct,
        confidencePct: item.confidencePct,
        reasons: item.reasons.slice(0, 3),
        reasonZh: summarizeOpportunityReasonZh(item.reasons),
      })),
    },
    riskDigest: {
      warnings: [...plan.warnings],
      blockedReasons: buildBlockedReasons(decisionResult),
    },
    marketContext,
  };
}

