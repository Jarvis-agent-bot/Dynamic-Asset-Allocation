import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { scanTaxLossHarvestingCandidates } from "@/src/daa/modules/workbench/taxLossHarvestingService";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const minLossPct = Number(url.searchParams.get("minLossPct")) || undefined;
    const minLossAbsBase = Number(url.searchParams.get("minLossAbsBase")) || undefined;

    const bootstrap = await buildWorkbenchBootstrap({ syncPrices: true });
    const result = await scanTaxLossHarvestingCandidates({
      bootstrap,
      config: {
        minLossPct: minLossPct ? minLossPct / 100 : undefined,
        minLossAbsBase,
      },
    });

    return ok(result);
  });
}
