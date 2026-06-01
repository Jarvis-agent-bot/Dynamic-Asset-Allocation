/**
 * GET /api/daa/agent/decision-audits
 *
 * 查询 AI Agent 决策审计记录，支持按 run / cycle / asset 复盘。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { listAgentDecisionAudits, type AgentDecisionKind } from "@/src/daa/agent/store/agentDecisionAuditStore";

function readLimit(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function readDecisionKind(value: string | null): AgentDecisionKind | null {
  if (
    value === "strategy_target_allocation"
    || value === "strategy_regime_override"
    || value === "strategy_plan_summary"
    || value === "thesis_review"
  ) {
    return value;
  }
  return null;
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const audits = await listAgentDecisionAudits({
      agentRunId: url.searchParams.get("agentRunId"),
      cycleId: url.searchParams.get("cycleId"),
      assetKey: url.searchParams.get("assetKey"),
      decisionKind: readDecisionKind(url.searchParams.get("decisionKind")),
      limit: readLimit(url.searchParams.get("limit")),
    });

    return ok({ audits });
  });
}
