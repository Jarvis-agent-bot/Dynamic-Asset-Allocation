/**
 * GET /api/daa/agent/decision-journal
 *
 * 聚合 Agent 决策记录，供前端展示“为什么这次目标权重这样变”。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { listAgentDecisionAudits, type AgentDecisionKind } from "@/src/daa/agent/store/agentDecisionAuditStore";
import { listTargetWeightAudits } from "@/src/daa/store/targetWeightAuditStore";
import type { AgentStrategyOverlay } from "@/src/daa/agent/cognitiveTypes";

function readLimit(value: string | null, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function readDecisionKind(value: string | null): AgentDecisionKind | null {
  if (
    value === "strategy_target_allocation"
    || value === "strategy_regime_override"
    || value === "strategy_plan_summary"
    || value === "thesis_review"
    || value === "human_daily_decision"
  ) {
    return value;
  }
  return null;
}

function normalizeAssetKey(value: string | null): string | null {
  const text = String(value || "").trim().toUpperCase();
  return text || null;
}

function readStrategyOverlay(value: unknown): AgentStrategyOverlay | null {
  if (!value || typeof value !== "object") return null;
  const briefing = value as { strategyOverlay?: unknown };
  const overlay = briefing.strategyOverlay;
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) return null;
  return overlay as AgentStrategyOverlay;
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const assetKey = normalizeAssetKey(url.searchParams.get("assetKey"));
    const auditLimit = readLimit(url.searchParams.get("auditLimit"), 80, 200);
    const weightLimit = readLimit(url.searchParams.get("weightLimit"), 50, 100);
    const decisionKind = readDecisionKind(url.searchParams.get("decisionKind"));

    const [latestRun, decisionAudits, targetWeightAudits] = await Promise.all([
      getLatestRun(),
      listAgentDecisionAudits({
        assetKey,
        decisionKind,
        limit: auditLimit,
      }),
      listTargetWeightAudits({
        assetKey,
        source: "agent_target_weight_pool",
        limit: weightLimit,
      }),
    ]);

    return ok({
      latestRun: latestRun ? {
        id: latestRun.id,
        status: latestRun.status,
        trigger: latestRun.trigger,
        createdAt: latestRun.createdAt,
        completedAt: latestRun.completedAt,
        totalTokens: latestRun.totalTokens,
        totalCostUsd: latestRun.totalCostUsd,
        strategyOverlay: readStrategyOverlay(latestRun.briefing),
      } : null,
      decisionAudits,
      targetWeightAudits,
    });
  });
}
