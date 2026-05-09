/**
 * 策略 Overlay 存储 — 读取 Agent 目标权重计划
 *
 * Agent 每个 cycle 在 surfaceNode 末尾通过 LLM 生成目标权重计划（strategyOverlay），
 * 存储在 daa_agent_runs.briefing JSONB 中。
 */

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import type { AgentStrategyOverlay } from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";

function normalizeStrategyOverlayFromBriefing(briefingRaw: unknown): AgentStrategyOverlay | null {
  const briefing = typeof briefingRaw === "string"
    ? JSON.parse(briefingRaw)
    : briefingRaw;

  const overlay = briefing?.strategyOverlay;
  if (!overlay || typeof overlay !== "object") return null;

  if (overlay.targetAllocationPlan && typeof overlay.targetAllocationPlan === "object") {
    if (!Array.isArray(overlay.targetAllocationPlan.intents)) overlay.targetAllocationPlan.intents = [];
  } else {
    overlay.targetAllocationPlan = null;
  }

  return overlay as AgentStrategyOverlay;
}

/**
 * 读取指定 Agent run 产出的目标权重计划，供 Autopilot 避免误用历史输出。
 */
export async function getAgentStrategyOverlayForRun(runId: string): Promise<AgentStrategyOverlay | null> {
  try {
    const id = String(runId || "").trim();
    if (!id) return null;
    const ownerAccountId = getDaaAccountScopeId();
    const row = await withDaaPgClient(async (client) => {
      const result = await client.query(
        `SELECT briefing FROM daa_agent_runs
         WHERE owner_account_id = $1
           AND id = $2
           AND status IN ('completed', 'completed_with_errors')
           AND briefing IS NOT NULL
         LIMIT 1`,
        [ownerAccountId, id],
      );
      return result.rows[0] ?? null;
    });
    return row ? normalizeStrategyOverlayFromBriefing(row.briefing) : null;
  } catch (e) {
    logSwallowed("strategyOverlayStore.getForRun", e);
    return null;
  }
}
