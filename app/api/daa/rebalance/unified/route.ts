import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";
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
        message: "POST JSON 到该接口可获取统一再平衡方案。追加 ?demo=1 可返回示例输入/输出。",
      });
    }

    return okV1({
      request: DAA_UNIFIED_SAMPLE_REQUEST_V1,
      response: buildDaaUnifiedPlanV1(DAA_UNIFIED_SAMPLE_REQUEST_V1),
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

    const body = await readJsonBodyV1<unknown>(req);
    if (!isDaaUnifiedRequestV1(body)) {
      return failV1("VALIDATION_FAILED", "request body is invalid", {
        status: 400,
        details: {
          expected: {
            targetWeights: "Record<string, number>",
            positions: "Array<{ symbol, qty, price, costBasis?, market?, currency?, tags?, liquidityNotional24h? }>",
            analysts: "Array<{ analystId, accuracyPct, riskControlPct, disciplinePct, transparencyPct, stance?, styleCluster? }> (optional)",
            assetViews: "Array<{ symbol, analystId, convictionPct, thesisDriftPct, momentumRegime? }> (optional)",
            humanSignals: "Array<{ symbol, aggregatedScorePct, convictionPct, thesisDriftPct, confidencePct?, momentumRegime?, stance?, riskTags?, sourceRefs? }> (optional)",
            risk: "{ maxDrawdownPct, perAssetStopLossPct, maxConcentrationPct, correlationCapPct, maxTotalRiskExposurePct } (optional)",
          },
        },
      });
    }

    const request = body as DaaUnifiedRequestV1;
    let hydratedRequest = request;

    if (!Array.isArray(request.humanSignals) || request.humanSignals.length === 0) {
      const targetSymbols = new Set<string>();
      for (const symbol of Object.keys(request.targetWeights ?? {})) {
        const key = String(symbol ?? "").trim().toUpperCase();
        if (key) targetSymbols.add(key);
      }
      for (const position of request.positions ?? []) {
        const key = String(position.symbol ?? "").trim().toUpperCase();
        if (key) targetSymbols.add(key);
      }

      const batch = await getLatestHumanSignalBatchV1({ symbols: [...targetSymbols] });
      hydratedRequest = {
        ...request,
        humanSignals: batch.signals.map((signal) => ({
          symbol: signal.symbol,
          aggregatedScorePct: signal.aggregatedScorePct,
          convictionPct: signal.convictionPct,
          thesisDriftPct: signal.thesisDriftPct,
          confidencePct: signal.confidencePct,
          momentumRegime: signal.momentumRegime,
          stance: signal.stance,
          riskTags: signal.riskTags,
          sourceRefs: signal.sourceRefs,
        })),
      };
    }

    const plan = buildDaaUnifiedPlanV1(hydratedRequest);
    try {
      await appendDaaRunHistoryV1({
        requestJson: hydratedRequest as unknown as Record<string, unknown>,
        responseJson: plan as unknown as Record<string, unknown>,
        summaryJson: (plan as any)?.summary && typeof (plan as any).summary === "object"
          ? (plan as any).summary as Record<string, unknown>
          : {},
        triggerSource: persist ? "manual" : "manual_preview",
      });
    } catch {
      // 运行历史写入失败不阻塞主流程。
    }
    if (!persist) return okV1({ plan });

    const created = await createDaaRebalanceDecisionV1({
      requestJson: hydratedRequest as unknown as Record<string, unknown>,
      responseJson: plan as unknown as Record<string, unknown>,
      shouldRebalance: Boolean(plan.summary.shouldRebalance),
      triggerSource: "manual",
    });

    return okV1({
      plan,
      decisionId: created.decision.id,
      decisionStatus: created.decision.status,
    });
  });
}
