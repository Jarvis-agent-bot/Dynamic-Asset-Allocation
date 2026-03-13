import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildStrategyLabSeedReadModel } from "@/src/daa/modules/read/strategyLabSeedReadService";
import { buildDevMemStrategyLabSeedReadModel, shouldUseDevMemFallback } from "@/src/daa/devMemFallback";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallback(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponse(authResult);
    if (denied) {
      if (shouldUseDevMemFallback()) return ok(buildDevMemStrategyLabSeedReadModel());
      return denied;
    }
    try {
      return ok(await buildStrategyLabSeedReadModel());
    } catch (error) {
      if (shouldUseDevMemFallback(error)) return ok(buildDevMemStrategyLabSeedReadModel());
      throw error;
    }
  });
}
