import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { appendDaaOpLogV1, listDaaOpLogV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 100);
    const entries = await listDaaOpLogV1(limit);
    return okV1({ entries });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{
      level?: unknown;
      message?: unknown;
      contextJson?: unknown;
    }>(req);

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return failV1("VALIDATION_FAILED", "message is required", { status: 400 });
    }

    const levelRaw = typeof body?.level === "string" ? body.level.trim().toLowerCase() : "info";
    const level = levelRaw === "warn" || levelRaw === "error" ? levelRaw : "info";

    const contextJson = body?.contextJson && typeof body.contextJson === "object" && !Array.isArray(body.contextJson)
      ? (body.contextJson as Record<string, unknown>)
      : {};

    const entry = await appendDaaOpLogV1({
      level,
      message,
      contextJson,
    });

    return okV1({ entry });
  });
}
