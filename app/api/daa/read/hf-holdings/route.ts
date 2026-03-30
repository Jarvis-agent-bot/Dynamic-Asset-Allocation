import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse } from "@/src/daa/modules/read/readRouteHelpers";
import { buildHfHoldingsReadModel } from "@/src/daa/modules/read/hfHoldingsReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() =>
    buildViewerReadRouteResponse(req, {
      load: async () => buildHfHoldingsReadModel(),
      fallback: () => {
        throw new Error("hf-holdings read fallback not available — database required");
      },
    }),
  );
}
