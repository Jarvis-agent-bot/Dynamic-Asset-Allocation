/**
 * GET /api/daa/agent/theses — 获取所有活跃研究论点 + 最近证据
 */

export const runtime = "nodejs";

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getActiveTheses, getThesisWithEvidence } from "@/src/daa/agent/store/thesisStore";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { countMemories } from "@/src/daa/agent/store/memoryStore";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const theses = await getActiveTheses();
    const latestRun = await getLatestRun();
    const memoryCount = await countMemories();

    return ok({
      theses,
      latestRun: latestRun ? {
        id: latestRun.id,
        status: latestRun.status,
        createdAt: latestRun.createdAt,
        thesesUpdated: latestRun.reasoningTraces.filter(t => t.node === "investigate").length,
        totalTokens: latestRun.totalTokens,
        briefing: latestRun.briefing ?? null,
      } : null,
      memoryCount,
    });
  });
}
