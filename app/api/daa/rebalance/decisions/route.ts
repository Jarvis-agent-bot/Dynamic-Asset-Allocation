import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/execution/executionTypesV1";
import { buildDaaUnifiedPlanV1, isDaaUnifiedRequestV1, type DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import {
  appendDaaRunHistoryV1,
  createDaaRebalanceDecisionV1,
  listDaaRebalanceDecisionsV1,
  type DaaStoreRebalanceDecisionV1,
} from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function toLimit(value: string | null): number {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

const DECISION_STATUS_SET = new Set<DaaStoreRebalanceDecisionV1["status"]>([
  "pending",
  "partial",
  "executed",
  "canceled",
  "skipped",
]);

const DECISION_TRIGGER_SOURCE_SET = new Set<DaaStoreRebalanceDecisionV1["triggerSource"]>([
  "manual",
  "cron_drift",
  "cron_scheduled",
]);

function parseDecisionStatus(value: unknown): DaaStoreRebalanceDecisionV1["status"] | undefined {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return undefined;
  if (DECISION_STATUS_SET.has(text as DaaStoreRebalanceDecisionV1["status"])) {
    return text as DaaStoreRebalanceDecisionV1["status"];
  }
  return undefined;
}

function parseTriggerSource(value: unknown): DaaStoreRebalanceDecisionV1["triggerSource"] {
  const text = String(value || "").trim().toLowerCase();
  if (DECISION_TRIGGER_SOURCE_SET.has(text as DaaStoreRebalanceDecisionV1["triggerSource"])) {
    return text as DaaStoreRebalanceDecisionV1["triggerSource"];
  }
  return "manual";
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = toLimit(url.searchParams.get("limit"));
    const statusRaw = url.searchParams.get("status");
    const status = parseDecisionStatus(statusRaw);
    if (statusRaw && !status) {
      return failV1("VALIDATION_FAILED", "status must be one of pending/partial/executed/canceled/skipped", { status: 400 });
    }

    const decisions = await listDaaRebalanceDecisionsV1({ limit, status });
    return okV1({ decisions });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ request?: unknown; triggerSource?: unknown; analysisFocus?: unknown }>(req);
    const request = body?.request;
    const analysisFocus = String(body?.analysisFocus || "").trim();

    if (!isDaaUnifiedRequestV1(request)) {
      return failV1("VALIDATION_FAILED", "request must match DaaUnifiedRequestV1", { status: 400 });
    }
    if (!analysisFocus) {
      return failV1("VALIDATION_FAILED", "analysisFocus is required", { status: 400 });
    }

    const unifiedRequest = request as DaaUnifiedRequestV1;
    const hydratedResult = await hydrateUnifiedRequestWithSignalsV1(unifiedRequest);
    const hydrated = hydratedResult.request;

    const plan = buildDaaUnifiedPlanV1(hydrated);
    const llmAnalysis = await runLlmAnalysisV1({
      analysisContext: "decision",
      baseCurrency: plan.summary.baseCurrency,
      shouldRebalance: plan.summary.shouldRebalance,
      analysisFocus,
      opportunities: hydratedResult.opportunityPanel.opportunities.map((item) => ({
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
      opportunityPanel: hydratedResult.opportunityPanel,
      hydrationDiagnostics: hydratedResult.diagnostics,
      llmAnalysis,
    };

    const triggerSource = parseTriggerSource(body?.triggerSource);
    const created = await createDaaRebalanceDecisionV1({
      requestJson: hydrated as unknown as Record<string, unknown>,
      responseJson: result as unknown as Record<string, unknown>,
      shouldRebalance: Boolean(plan.summary.shouldRebalance),
      triggerSource,
    });

    try {
      await appendDaaRunHistoryV1({
        requestJson: hydrated as unknown as Record<string, unknown>,
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
        triggerSource,
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
