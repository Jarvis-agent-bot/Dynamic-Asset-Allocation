/**
 * POST /api/daa/agent/run — 手动触发 Cognitive Agent 循环
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

import { withApiHandler, ok, fail, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const result = await runCognitiveAgentCycle("manual");

    return ok({
      runId: result.runId,
      thesesUpdated: result.thesesUpdated,
      surprises: result.surprises,
      totalTokens: result.totalTokens,
      errors: result.errors,
      durationMs: result.durationMs,
    });
  });
}
