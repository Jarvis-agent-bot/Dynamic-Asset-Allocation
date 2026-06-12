/**
 * POST /api/daa/agent/daily-decision/action
 *
 * 记录人在 Today 页对“今日组合动作”的明确选择。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail, mapDeniedResponse, readJsonBody } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { recordAgentDecisionAudit } from "@/src/daa/agent/store/agentDecisionAuditStore";
import { buildDailyDecisionBriefFromBriefing, type DailyDecisionBriefingInput } from "@/src/daa/agent/dailyDecisionBrief";

type DailyDecisionAction = "approve_plan" | "reject_plan" | "hold_current";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readAction(value: unknown): DailyDecisionAction | null {
  const text = String(value || "").trim();
  if (text === "approve_plan" || text === "reject_plan" || text === "hold_current") return text;
  return null;
}

function actionSummary(action: DailyDecisionAction): string {
  if (action === "approve_plan") return "人类批准今日目标权重方案";
  if (action === "reject_plan") return "人类拒绝今日目标权重方案";
  return "人类选择今日保持当前仓位";
}

function actionReason(action: DailyDecisionAction): string {
  if (action === "approve_plan") return "人已确认本轮目标权重变化，可作为后续调仓处理依据。";
  if (action === "reject_plan") return "人不接受本轮目标权重变化，后续复盘需要避免重复使用同一理由直接打扰。";
  return "人确认今天不做组合动作，后台复核和风险观察继续运行。";
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody(req);
    const payload = isRecord(body) ? body : {};
    const action = readAction(payload.action);
    if (!action) return fail("VALIDATION_FAILED", "invalid daily decision action");

    const latestRun = await getLatestRun();
    if (!latestRun?.briefing) return fail("NOT_FOUND", "latest agent briefing not found", { status: 404 });

    const dailyBrief = buildDailyDecisionBriefFromBriefing(latestRun.briefing as DailyDecisionBriefingInput);
    if (!dailyBrief) return fail("NOT_FOUND", "daily decision brief not available", { status: 404 });
    if (action === "approve_plan" && dailyBrief.approvals.length === 0) {
      return fail("VALIDATION_FAILED", "no target allocation plan to approve");
    }

    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 500) : "";
    const auditId = await recordAgentDecisionAudit({
      agentRunId: latestRun.id,
      node: "human",
      decisionKind: "human_daily_decision",
      summary: actionSummary(action),
      reasoning: note || actionReason(action),
      inputSnapshot: {
        latestRunId: latestRun.id,
        dailyBrief: {
          posture: dailyBrief.posture,
          title: dailyBrief.title,
          approvalCount: dailyBrief.metrics.approvalCount,
          backgroundCount: dailyBrief.metrics.backgroundCount,
        },
      },
      evidenceSnapshot: {
        approvals: dailyBrief.approvals.map((approval) => ({
          title: approval.title,
          reason: approval.reason,
          confidencePct: approval.confidencePct,
          assetKey: approval.intent.assetKey,
          symbol: approval.intent.symbol,
          proposedTargetWeightPct: approval.intent.proposedTargetWeightPct,
        })),
      },
      decisionPayload: {
        action,
        note: note || null,
        posture: dailyBrief.posture,
        approvalCount: dailyBrief.approvals.length,
        approvals: dailyBrief.approvals.map((approval) => ({
          assetKey: approval.intent.assetKey,
          symbol: approval.intent.symbol,
          proposedTargetWeightPct: approval.intent.proposedTargetWeightPct,
          confidence: approval.intent.confidence,
          reasoning: approval.intent.reasoning,
        })),
      },
    });

    return ok({ auditId, action, dailyBrief });
  });
}
