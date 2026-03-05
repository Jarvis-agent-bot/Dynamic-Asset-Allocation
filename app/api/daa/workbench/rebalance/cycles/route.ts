import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listDaaRebalanceCyclesV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Math.trunc(Number(url.searchParams.get("limit") || 100) || 100)));
    const cycles = await listDaaRebalanceCyclesV1(limit);
    return okV1({ cycles });
  });
}
