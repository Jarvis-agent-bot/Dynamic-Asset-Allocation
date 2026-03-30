/**
 * GET /api/daa/read/cash-analytics
 * 现金管理分析读取端点
 *
 * 返回现金头寸分析、部署建议和市场环境上下文
 */

import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildViewerReadRouteResponse } from "@/src/daa/modules/read/readRouteHelpers";
import { buildCashAnalyticsReadModel } from "@/src/daa/modules/read/cashAnalyticsReadService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(() =>
    buildViewerReadRouteResponse(req, {
      load: async () => {
        return buildCashAnalyticsReadModel();
      },
      fallback: () => {
        throw new Error("cash analytics read fallback not available — database required");
      },
    }),
  );
}
