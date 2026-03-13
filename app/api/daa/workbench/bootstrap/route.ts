import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const data = await buildWorkbenchBootstrap({
      syncPrices: false,
      autoRiskCycle: false,
    });
    return ok(data);
  });
}
