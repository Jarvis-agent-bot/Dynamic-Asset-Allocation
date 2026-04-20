/**
 * GET /api/daa/agent/theses — 获取所有活跃研究论点 + 最近证据
 */

export const runtime = "nodejs";

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import {
  getActiveTheses,
  getThesesByAssetKey,
  getLatestEvidenceByThreadIds,
} from "@/src/daa/agent/store/thesisStore";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { countMemories } from "@/src/daa/agent/store/memoryStore";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const assetKey = url.searchParams.get("assetKey")?.trim();

    // assetKey 过滤模式：返回该资产相关的 thesis + 各自最新 3 条证据
    if (assetKey) {
      const theses = await getThesesByAssetKey(assetKey);
      const evidenceMap = theses.length > 0
        ? await getLatestEvidenceByThreadIds(theses.map(t => t.id), 3)
        : new Map();
      return ok({
        theses: theses.map(t => ({
          ...t,
          latestEvidence: evidenceMap.get(t.id) ?? [],
        })),
        assetKey,
      });
    }

    const [theses, latestRun, memoryCount] = await Promise.all([
      getActiveTheses(),
      getLatestRun(),
      countMemories(),
    ]);

    // 透出 cron schedule 给 UI 展示自动运行节奏
    let schedule: { mode: string; timesUtc: string[] } | null = null;
    try {
      const sys = await getDaaSystemConfig();
      const ca = sys.config.cognitiveAgent;
      if (ca?.enabled) {
        schedule = {
          mode: ca.schedule ?? "2x_daily",
          timesUtc: ca.scheduleTimesUtc ?? ["13:00", "21:00"],
        };
      }
    } catch (e) {
      logSwallowed("agent.theses.schedule", e);
    }

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
      schedule,
    });
  });
}
