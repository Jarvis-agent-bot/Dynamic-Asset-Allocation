/**
 * POST /api/daa/agent/theses/review-action — 记录人在 Today 队列里的处理动作。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail, mapDeniedResponse, readJsonBody } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import {
  markThesesQueueAction,
  type ThesisQueueReviewAction,
} from "@/src/daa/agent/store/thesisStore";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readAction(value: unknown): ThesisQueueReviewAction | null {
  const text = String(value || "").trim();
  if (text === "decided" || text === "snoozed" || text === "request_investigation") return text;
  return null;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody(req);
    const payload = isRecord(body) ? body : {};
    const action = readAction(payload.action);
    const rawThreadIds = Array.isArray(payload.threadIds) ? payload.threadIds : [];
    const threadIds = rawThreadIds.map((id) => String(id || "").trim()).filter(Boolean);

    if (!action) return fail("VALIDATION_FAILED", "invalid review action");
    if (threadIds.length === 0) return fail("VALIDATION_FAILED", "threadIds required");

    const updated = await markThesesQueueAction(threadIds, action);
    return ok({ updated, action });
  });
}
