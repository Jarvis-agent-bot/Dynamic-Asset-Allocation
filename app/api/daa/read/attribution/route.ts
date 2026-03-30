/**
 * GET /api/daa/read/attribution
 * 绩效归因读取端点
 *
 * 查询参数：
 * - period: "30d" | "90d" | "1y" | "ytd" | "all" (default: "1y")
 */

import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse } from "@/src/daa/modules/read/readRouteHelpers";
import { buildAttributionReadModel } from "@/src/daa/modules/read/attributionReadService";

export const runtime = "nodejs";

/**
 * 验证并规范化周期参数
 */
function normalizePeriod(
  value: string | null,
  fallback: "30d" | "90d" | "1y" | "ytd" | "all" = "1y",
): "30d" | "90d" | "1y" | "ytd" | "all" {
  if (!value) return fallback;

  const text = String(value).trim().toLowerCase();

  switch (text) {
    case "30d":
    case "30days":
    case "month":
      return "30d";
    case "90d":
    case "90days":
    case "quarter":
      return "90d";
    case "1y":
    case "1year":
    case "year":
      return "1y";
    case "ytd":
      return "ytd";
    case "all":
    case "alltime":
      return "all";
    default:
      return fallback;
  }
}

export async function GET(req: Request) {
  return withApiHandler(() =>
    buildViewerReadRouteResponse(req, {
      load: async (searchParams) => {
        const period = normalizePeriod(searchParams.get("period"), "1y");
        return buildAttributionReadModel(period);
      },
      fallback: () => {
        throw new Error("attribution read fallback not available — database required");
      },
    }),
  );
}
