/**
 * POST /api/daa/agent/run — 手动触发 Cognitive Agent 循环
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import { resolveBrainConfig } from "@/src/daa/brain/brainPolicy";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const system = await getDaaSystemConfig();
    if (resolveBrainConfig(system.config.brain).mode === "autopilot") {
      const result = await runAutopilotLoop({
        source: "manual",
        reason: "manual api autopilot run",
        forceAgentRun: true,
      });
      return ok({
        autopilot: true,
        ...result,
      });
    }

    const result = await runCognitiveAgentCycle("manual");
    return ok({
      autopilot: false,
      runId: result.runId,
      thesesUpdated: result.thesesUpdated,
      surprises: result.surprises,
      totalTokens: result.totalTokens,
      errors: result.errors,
      durationMs: result.durationMs,
    });
  });
}
