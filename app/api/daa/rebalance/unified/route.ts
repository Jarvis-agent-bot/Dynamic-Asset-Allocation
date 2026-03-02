import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { DEFAULT_ANALYSIS_FOCUS_V1, runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/execution/executionTypesV1";
import { appendDaaRunHistoryV1, createDaaRebalanceDecisionV1 } from "@/src/daa/store/daaStorePgV1";
import {
  buildDaaUnifiedPlanV1,
  DAA_UNIFIED_SAMPLE_REQUEST_V1,
  isDaaUnifiedRequestV1,
  type DaaUnifiedRequestV1,
} from "@/src/daa/unifiedRebalanceV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const withDemo = url.searchParams.get("demo") === "1";

    if (!withDemo) {
      return okV1({
        message: "POST { request, analysisFocus } 到该接口可获取统一再平衡方案（schemaVersion=2）。追加 ?demo=1 可返回示例输入/输出。",
      });
    }

    const hydrated = await hydrateUnifiedRequestWithSignalsV1(DAA_UNIFIED_SAMPLE_REQUEST_V1);
    const plan = buildDaaUnifiedPlanV1(hydrated.request);
    const response: UnifiedDecisionResultV2 = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      plan,
      opportunityPanel: hydrated.opportunityPanel,
      hydrationDiagnostics: hydrated.diagnostics,
      llmAnalysis: {
        status: "skipped",
        provider: "demo",
        model: "demo",
        generatedAt: new Date().toISOString(),
        summary: "demo 模式默认不触发 LLM。",
        opportunityNotes: [],
        riskNotes: [],
        latencyMs: 0,
        reason: "demo_mode",
      },
    };

    return okV1({
      request: hydrated.request,
      analysisFocus: DEFAULT_ANALYSIS_FOCUS_V1,
      response,
    });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const url = new URL(req.url);
    const persist = url.searchParams.get("persist") !== "0";
    const denied = mapDeniedResponseV1(
      await (persist ? requireDaaAdminEditorAuth(req) : requireDaaAdminViewerAuth(req)),
    );
    if (denied) return denied;

    const body = await readJsonBodyV1<{ request?: unknown; analysisFocus?: unknown }>(req);
    const requestRaw = body?.request;
    const analysisFocus = String(body?.analysisFocus || "").trim();

    if (!analysisFocus) {
      return failV1("VALIDATION_FAILED", "analysisFocus is required", { status: 400 });
    }

    if (!isDaaUnifiedRequestV1(requestRaw)) {
      return failV1("VALIDATION_FAILED", "request body is invalid", {
        status: 400,
        details: {
          expected: {
            request: "DaaUnifiedRequestV1",
            analysisFocus: "string (required)",
            targetWeights: "Record<string, number>",
            positions: "Array<{ symbol, qty, price, costBasis?, market?, currency?, tags? }>",
            watchlistCandidates: "Array<{ symbol, market?, currency?, targetWeightHint?, enabled?, tags?, notes? }> (optional)",
            fxRates: "Array<{ baseCcy, quoteCcy, rate, source?, asOfTs? }> (optional)",
            analysts: "Array<{ analystId, accuracyPct, riskControlPct, disciplinePct, transparencyPct, stance?, styleCluster? }> (optional)",
            assetViews: "Array<{ symbol, analystId, convictionPct, thesisDriftPct, momentumRegime? }> (optional)",
            humanSignals: "Array<{ symbol, aggregatedScorePct, convictionPct, thesisDriftPct, confidencePct?, momentumRegime?, stance?, riskTags?, sourceRefs? }> (optional, 若缺失将自动融合三维信号)",
            risk: "{ maxDrawdownPct, perAssetStopLossPct, maxConcentrationPct, correlationCapPct, maxTotalRiskExposurePct } (optional)",
          },
        },
      });
    }

    const request = requestRaw as DaaUnifiedRequestV1;
    const hydrated = await hydrateUnifiedRequestWithSignalsV1(request);
    const hydratedRequest = hydrated.request;

    const plan = buildDaaUnifiedPlanV1(hydratedRequest);
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
    });

    const result: UnifiedDecisionResultV2 = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      plan,
      opportunityPanel: hydrated.opportunityPanel,
      hydrationDiagnostics: hydrated.diagnostics,
      llmAnalysis,
    };

    if (!persist) {
      try {
        await appendDaaRunHistoryV1({
          requestJson: hydratedRequest as unknown as Record<string, unknown>,
          responseJson: result as unknown as Record<string, unknown>,
          summaryJson: result.plan.summary as unknown as Record<string, unknown>,
          triggerSource: "manual_preview",
        });
      } catch {
        // 运行历史写入失败不阻塞主流程。
      }
      return okV1(result);
    }

    const created = await createDaaRebalanceDecisionV1({
      requestJson: hydratedRequest as unknown as Record<string, unknown>,
      responseJson: result as unknown as Record<string, unknown>,
      shouldRebalance: Boolean(plan.summary.shouldRebalance),
      triggerSource: "manual",
    });

    try {
      await appendDaaRunHistoryV1({
        requestJson: hydratedRequest as unknown as Record<string, unknown>,
        responseJson: {
          ...result,
          decisionId: created.decision.id,
          decisionStatus: created.decision.status,
        } as Record<string, unknown>,
        summaryJson: {
          ...(result.plan.summary as unknown as Record<string, unknown>),
          decisionId: created.decision.id,
          decisionStatus: created.decision.status,
        },
        triggerSource: "manual",
      });
    } catch {
      // 运行历史写入失败不阻塞主流程。
    }

    return okV1({
      ...result,
      decisionId: created.decision.id,
      decisionStatus: created.decision.status,
    });
  });
}
