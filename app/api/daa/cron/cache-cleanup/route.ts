import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { runLoggedJobV1 } from "@/src/daa/jobs/jobServiceV1";
import { cleanupMarketCacheRawPayloadV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJobV1({
      req,
      jobType: "market_cache_cleanup",
      triggerSource: "cron_cache_cleanup",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => result && typeof result === "object" ? result as Record<string, unknown> : {},
      handler: async () => cleanupMarketCacheRawPayloadV1(),
    });

    return okV1({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
