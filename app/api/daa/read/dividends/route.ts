import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse } from "@/src/daa/modules/read/readRouteHelpers";
import { buildDividendReadModel } from "@/src/daa/modules/read/dividendReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() =>
    buildViewerReadRouteResponse(req, {
      load: async () => buildDividendReadModel(),
      fallback: () => {
        throw new Error("dividend read fallback not available — database required");
      },
    }),
  );
}
