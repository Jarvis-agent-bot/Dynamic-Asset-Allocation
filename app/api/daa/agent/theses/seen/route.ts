/**
 * POST /api/daa/agent/theses/seen — 记录 Today 决策队列中已展示给人的判断。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { markThesesSeen } from "@/src/daa/agent/store/thesisStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    let body: unknown = null;
    try {
      body = await req.json();
    } catch (err) {
      logSwallowed("agent.theses.seen.parseBody", err);
    }

    const payload = isRecord(body) ? body : {};
    const rawThreadIds = Array.isArray(payload.threadIds) ? payload.threadIds : [];
    const threadIds = rawThreadIds.map((id) => String(id || "").trim()).filter(Boolean);
    const updated = await markThesesSeen(threadIds);
    return ok({ updated });
  });
}
