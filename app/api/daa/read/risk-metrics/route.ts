import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse, parseIntegerSearchParam } from "@/src/daa/modules/read/readRouteHelpers";
import { buildRiskMetricsReadModel } from "@/src/daa/modules/read/riskMetricsReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() =>
    buildViewerReadRouteResponse(req, {
      load: (searchParams) =>
        buildRiskMetricsReadModel({
          lookbackDays: parseIntegerSearchParam(searchParams.get("lookbackDays"), 252),
          highCorrelationThreshold: Number.isFinite(Number(searchParams.get("highCorrelationThreshold")))
            ? Math.max(0.5, Math.min(0.99, Number(searchParams.get("highCorrelationThreshold"))))
            : 0.7,
        }),
      fallback: () => {
        throw new Error("risk-metrics read fallback not available — database required");
      },
    }),
  );
}
