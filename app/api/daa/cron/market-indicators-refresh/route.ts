import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { refreshMarketIndicatorsV1 } from "@/src/daa/modules/marketContext/marketIndicatorServiceV1";

export const runtime = "nodejs";

async function handle(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const result = await refreshMarketIndicatorsV1();
    return okV1({
      refreshedCount: result.refreshedCount,
      marketContext: result.marketContext,
      indicators: result.indicators,
      at: new Date().toISOString(),
    });
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
