import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse, parseBooleanSearchParam } from "@/src/daa/modules/read/readRouteHelpers";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadModelService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() => buildViewerReadRouteResponse(req, {
    load: async (searchParams) => {
      return buildWorkbenchReadModel({
        syncPrices: parseBooleanSearchParam(searchParams.get("syncPrices"), false),
        autoRiskCycle: parseBooleanSearchParam(searchParams.get("autoRiskCycle"), false),
      });
    },
  }));
}
