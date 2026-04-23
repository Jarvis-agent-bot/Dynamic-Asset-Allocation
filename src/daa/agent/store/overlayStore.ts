/**
 * Overlay Store — 读取最近的 Agent Config Overlay
 *
 * Agent 每个 cycle 在 surfaceNode 末尾通过 LLM 生成策略参数建议（configOverlay），
 * 存储在 daa_agent_runs.briefing JSONB 中。
 * 规则引擎（drift-check、marketContext、riskCheck）从这里读取。
 *
 * 24 小时过期：超过 24 小时的 overlay 视为过期，返回 null。
 */

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import type { AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const OVERLAY_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时

function normalizeOverlayFromBriefing(briefingRaw: unknown): AgentConfigOverlay | null {
  const briefing = typeof briefingRaw === "string"
    ? JSON.parse(briefingRaw)
    : briefingRaw;

  const overlay = briefing?.configOverlay;
  if (!overlay || typeof overlay !== "object") return null;

  // 基础结构校验
  if (!Array.isArray(overlay.driftOverrides)) overlay.driftOverrides = [];
  if (!Array.isArray(overlay.riskAdjustments)) overlay.riskAdjustments = [];

  return overlay as AgentConfigOverlay;
}

/**
 * 读取最近 24 小时内完成的 Agent run 的 configOverlay。
 * 超过 24 小时或无 overlay 时返回 null。
 */
export async function getLatestAgentConfigOverlay(): Promise<AgentConfigOverlay | null> {
  try {
    const cutoff = new Date(Date.now() - OVERLAY_TTL_MS).toISOString();
    const row = await withDaaPgClient(async (client) => {
      const result = await client.query(
        `SELECT briefing FROM daa_agent_runs
         WHERE status IN ('completed', 'completed_with_errors')
           AND completed_at >= $1
           AND briefing IS NOT NULL
         ORDER BY completed_at DESC LIMIT 1`,
        [cutoff],
      );
      return result.rows[0] ?? null;
    });

    if (!row) return null;

    return normalizeOverlayFromBriefing(row.briefing);
  } catch (e) {
    logSwallowed("overlayStore.getLatest", e);
    return null;
  }
}

/**
 * 读取指定 Agent run 产出的 overlay，供 Autopilot 避免误用历史 overlay。
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
