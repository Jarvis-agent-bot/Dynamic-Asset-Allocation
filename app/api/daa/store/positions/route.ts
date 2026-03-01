import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listDaaPositionsV1, replaceDaaPositionsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const positions = await listDaaPositionsV1();
    return okV1({ positions });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ positions?: unknown }>(req);
    const positions = Array.isArray(body?.positions) ? body.positions : [];
    if (!Array.isArray(body?.positions)) {
      return failV1("VALIDATION_FAILED", "positions must be an array", { status: 400 });
    }

    const saved = await replaceDaaPositionsV1(positions as any[]);
    return okV1({ positions: saved });
  });
}
