import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { buildOverviewReadModelV1 } from "@/src/daa/modules/read/overviewReadServiceV1";
import { buildDevMemOverviewReadModelV1, shouldUseDevMemFallbackV1 } from "@/src/daa/devMemFallbackV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallbackV1(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponseV1(authResult);
    if (denied) {
      if (shouldUseDevMemFallbackV1()) return okV1(buildDevMemOverviewReadModelV1());
      return denied;
    }
    try {
      return okV1(await buildOverviewReadModelV1());
    } catch (error) {
      if (shouldUseDevMemFallbackV1(error)) return okV1(buildDevMemOverviewReadModelV1());
      throw error;
    }
  });
}
