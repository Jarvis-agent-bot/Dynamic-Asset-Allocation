import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildDevMemTradesReadModel } from "@/src/daa/devMemFallback";
import { buildViewerReadRouteResponse, parseIntegerSearchParam } from "@/src/daa/modules/read/readRouteHelpers";
import { buildTradesReadModel } from "@/src/daa/modules/read/tradesReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() => buildViewerReadRouteResponse(req, {
    load: (searchParams) => buildTradesReadModel({
      tradeLimit: parseIntegerSearchParam(searchParams.get("tradeLimit"), 150),
      reportLimit: parseIntegerSearchParam(searchParams.get("reportLimit"), 120),
    }),
    fallback: () => buildDevMemTradesReadModel(),
  }));
}
