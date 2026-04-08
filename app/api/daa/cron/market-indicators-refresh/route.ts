import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_market_indicators_refresh",
      triggerSource: "cron_market_indicators_refresh",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (r) => {
        const result = r as Record<string, unknown>;
        return { refreshedCount: result.refreshedCount, regime: (result.marketContext as Record<string, unknown>)?.regime };
      },
      handler: async () => refreshMarketIndicators(),
    });

    const result = execution.result as Record<string, unknown>;
    return ok({
      ...result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}
