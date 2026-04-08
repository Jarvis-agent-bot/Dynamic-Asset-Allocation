import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { runUnifiedDataCleanup } from "@/src/daa/modules/marketCache/marketCacheService";

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
      jobType: "cron_cache_cleanup",
      triggerSource: "cron_cache_cleanup",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => result && typeof result === "object" ? result as Record<string, unknown> : {},
      handler: async () => runUnifiedDataCleanup(),
    });

    return ok({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}
