import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildOverviewReadModel } from "@/src/daa/modules/read/overviewReadService";
import { buildDevMemOverviewReadModel, shouldUseDevMemFallback } from "@/src/daa/devMemFallback";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallback(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponse(authResult);
    if (denied) {
      if (shouldUseDevMemFallback()) return ok(buildDevMemOverviewReadModel());
      return denied;
    }
    try {
      return ok(await buildOverviewReadModel());
    } catch (error) {
      if (shouldUseDevMemFallback(error)) return ok(buildDevMemOverviewReadModel());
      throw error;
    }
  });
}
