import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";
import { buildDaaUnifiedPlanV1, isDaaUnifiedRequestV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import { createDaaRebalanceDecisionV1, listDaaRebalanceDecisionsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function normalizeSymbol(v: unknown): string {
  return String(v || "").trim().toUpperCase();
}

function toLimit(value: string | null): number {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = toLimit(url.searchParams.get("limit"));
    const status = String(url.searchParams.get("status") || "").trim() || undefined;

    const decisions = await listDaaRebalanceDecisionsV1({ limit, status: status as any });
    return okV1({ decisions });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ request?: unknown; triggerSource?: unknown }>(req);
    const request = body?.request;

    if (!isDaaUnifiedRequestV1(request)) {
      return failV1("VALIDATION_FAILED", "request must match DaaUnifiedRequestV1", { status: 400 });
    }

    const unifiedRequest = request as DaaUnifiedRequestV1;
    let hydrated = unifiedRequest;
    if (!Array.isArray(unifiedRequest.humanSignals) || unifiedRequest.humanSignals.length === 0) {
      const targetSymbols = new Set<string>();
      for (const symbol of Object.keys(unifiedRequest.targetWeights || {})) {
        const key = normalizeSymbol(symbol);
        if (key) targetSymbols.add(key);
      }
      for (const position of unifiedRequest.positions || []) {
        const key = normalizeSymbol(position.symbol);
        if (key) targetSymbols.add(key);
      }

      const batch = await getLatestHumanSignalBatchV1({ symbols: [...targetSymbols] });
      hydrated = {
        ...unifiedRequest,
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

    const plan = buildDaaUnifiedPlanV1(hydrated);
    const created = await createDaaRebalanceDecisionV1({
      requestJson: hydrated as unknown as Record<string, unknown>,
      responseJson: plan as unknown as Record<string, unknown>,
      shouldRebalance: Boolean(plan.summary.shouldRebalance),
      triggerSource: String(body?.triggerSource || "manual") as any,
    });

    return okV1({
      decisionId: created.decision.id,
      decision: created.decision,
      orders: created.orders,
      plan,
    });
  });
}
