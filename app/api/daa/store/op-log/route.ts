import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { appendDaaOpLog, listDaaOpLog } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 100);
    const entries = await listDaaOpLog(limit);
    return ok({ entries });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{
      level?: unknown;
      message?: unknown;
      contextJson?: unknown;
    }>(req);

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return fail("VALIDATION_FAILED", "message is required", { status: 400 });
    }

    const levelRaw = typeof body?.level === "string" ? body.level.trim().toLowerCase() : "info";
    const level = levelRaw === "warn" || levelRaw === "error" ? levelRaw : "info";

    const contextJson = body?.contextJson && typeof body.contextJson === "object" && !Array.isArray(body.contextJson)
      ? (body.contextJson as Record<string, unknown>)
      : {};

    const entry = await appendDaaOpLog({
      level,
      message,
      contextJson,
    });

    return ok({ entry });
  });
}
