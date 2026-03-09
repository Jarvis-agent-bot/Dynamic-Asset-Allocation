import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { refreshMarketIndicatorsV1 } from "@/src/daa/modules/marketContext/marketIndicatorServiceV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const result = await refreshMarketIndicatorsV1();
    return okV1({
      marketContext: result.marketContext,
      indicators: result.indicators,
      refreshedCount: result.refreshedCount,
      at: new Date().toISOString(),
    });
  });
}
