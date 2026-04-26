/**
 * Overlay Store — 读取 Agent 目标权重计划
 *
 * Agent 每个 cycle 在 surfaceNode 末尾通过 LLM 生成目标权重计划（configOverlay），
 * 存储在 daa_agent_runs.briefing JSONB 中。
 */

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import type { AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function normalizeOverlayFromBriefing(briefingRaw: unknown): AgentConfigOverlay | null {
  const briefing = typeof briefingRaw === "string"
    ? JSON.parse(briefingRaw)
    : briefingRaw;

  const overlay = briefing?.configOverlay;
  if (!overlay || typeof overlay !== "object") return null;

  if (overlay.targetAllocationPlan && typeof overlay.targetAllocationPlan === "object") {
    if (!Array.isArray(overlay.targetAllocationPlan.intents)) overlay.targetAllocationPlan.intents = [];
  } else {
    overlay.targetAllocationPlan = null;
  }

  return overlay as AgentConfigOverlay;
}

/**
 * 读取指定 Agent run 产出的目标权重计划，供 Autopilot 避免误用历史输出。
 */
export async function getAgentConfigOverlayForRun(runId: string): Promise<AgentConfigOverlay | null> {
  try {
    const id = String(runId || "").trim();
    if (!id) return null;
    const row = await withDaaPgClient(async (client) => {
      const result = await client.query(
        `SELECT briefing FROM daa_agent_runs
         WHERE id = $1
           AND status IN ('completed', 'completed_with_errors')
           AND briefing IS NOT NULL
         LIMIT 1`,
        [id],
      );
      return result.rows[0] ?? null;
    });
    return row ? normalizeOverlayFromBriefing(row.briefing) : null;
  } catch (e) {
    logSwallowed("overlayStore.getForRun", e);
    return null;
  }
}
