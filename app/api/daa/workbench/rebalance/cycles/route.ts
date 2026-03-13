import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listDaaRebalanceCycles } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Math.trunc(Number(url.searchParams.get("limit") || 100) || 100)));
    const cycles = await listDaaRebalanceCycles(limit);
    return ok({ cycles });
  });
}
