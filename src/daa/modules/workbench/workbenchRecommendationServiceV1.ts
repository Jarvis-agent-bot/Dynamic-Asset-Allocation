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

import { buildUnifiedRequestFromStoreV1 } from "./workbenchReadServiceV1";
import {
  buildBlockedReasonsV1,
  buildRecommendationRowsV1,
  mapOpportunityActionLabelZhV1,
  normalizeText,
  summarizeOpportunityReasonZhV1,
} from "./workbenchSharedV1";

export async function runWorkbenchRecommendationsV1(input: {
  analysisFocus?: string;
  triggerSource?: "manual" | "cron_scheduled";
}): Promise<WorkbenchRecommendationsResultV1> {
  const analysisFocus = normalizeText(input.analysisFocus) || DEFAULT_ANALYSIS_FOCUS_V1;
  const triggerSource = input.triggerSource === "cron_scheduled" ? "cron_scheduled" : "manual";
  const { request, assetRows } = await buildUnifiedRequestFromStoreV1();
  const hydrated = await hydrateUnifiedRequestWithSignalsV1(request);
  const plan = buildDaaUnifiedPlanV1(hydrated.request);
  let marketContext: DaaMarketContextV1 | null = null;
  try {
    marketContext = await getCurrentMarketContextV1({ allowStale: true });
  } catch {
    marketContext = null;
  }

  const llmAnalysis = await runLlmAnalysisV1({
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

  const decisionResult: UnifiedDecisionResultV2 = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plan,
    opportunityPanel: hydrated.opportunityPanel,
    hydrationDiagnostics: hydrated.diagnostics,
    llmAnalysis,
  };

  const created = await createDaaRebalanceDecisionV1({
    requestJson: hydrated.request as unknown as Record<string, unknown>,
    responseJson: decisionResult as unknown as Record<string, unknown>,
    shouldRebalance: Boolean(plan.summary.shouldRebalance),
    triggerSource,
  });

  const decisionId = created.decision.id;
  const decisionStatus = created.decision.status;

  try {
    await appendDaaRunHistoryV1({
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
    recommendations: buildRecommendationRowsV1({
      result: decisionResult,
      decisionId,
      assetRows,
    }),
    blockedReasons: buildBlockedReasonsV1(decisionResult),
    warnings: [...plan.warnings],
    insightDigest: {
      topOpportunities: hydrated.opportunityPanel.opportunities.slice(0, 5).map((item) => ({
        symbol: item.symbol,
        action: item.action,
        actionLabelZh: mapOpportunityActionLabelZhV1(item.action),
        finalScorePct: item.finalScorePct,
        confidencePct: item.confidencePct,
        reasons: item.reasons.slice(0, 3),
        reasonZh: summarizeOpportunityReasonZhV1(item.reasons),
      })),
    },
    riskDigest: {
      warnings: [...plan.warnings],
      blockedReasons: buildBlockedReasonsV1(decisionResult),
    },
    marketContext,
  };
}

