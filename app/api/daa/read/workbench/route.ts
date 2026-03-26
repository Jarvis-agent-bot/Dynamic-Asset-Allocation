import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildDevMemWorkbenchReadModel } from "@/src/daa/devMemFallback";
import { seedDevDataIfNeeded } from "@/src/daa/devMemSeed";
import { buildViewerReadRouteResponse, parseBooleanSearchParam } from "@/src/daa/modules/read/readRouteHelpers";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() => buildViewerReadRouteResponse(req, {
    load: async (searchParams) => {
      await seedDevDataIfNeeded();
      return buildWorkbenchReadModel({
        syncPrices: parseBooleanSearchParam(searchParams.get("syncPrices"), false),
        autoRiskCycle: parseBooleanSearchParam(searchParams.get("autoRiskCycle"), false),
      });
    },
    fallback: () => buildDevMemWorkbenchReadModel(),
  }));
}
