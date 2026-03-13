import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const result = await refreshMarketIndicators();
    return ok({
      marketContext: result.marketContext,
      indicators: result.indicators,
      refreshedCount: result.refreshedCount,
      at: new Date().toISOString(),
    });
  });
}
