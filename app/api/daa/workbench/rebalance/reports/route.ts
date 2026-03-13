import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listWorkbenchRebalanceReports } from "@/src/daa/modules/workbench/workbenchReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Math.trunc(Number(url.searchParams.get("limit") || 50) || 50)));
    const reports = await listWorkbenchRebalanceReports(limit);
    return ok({ reports });
  });
}
