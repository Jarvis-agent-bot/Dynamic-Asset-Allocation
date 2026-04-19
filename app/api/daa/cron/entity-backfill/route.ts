import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { runEntityBackfill } from "@/src/daa/agent/entities/entityBackfill";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const url = new URL(req.url);
    const memoryLimit = Number(url.searchParams.get("memoryLimit")) || 200;
    const thesisLimit = Number(url.searchParams.get("thesisLimit")) || 200;

    const execution = await runLoggedJob({
      req,
      jobType: "cron_entity_backfill",
      triggerSource: "cron_entity_backfill",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => (result && typeof result === "object" ? { ...(result as object) } as Record<string, unknown> : {}),
      handler: async () => runEntityBackfill({ memoryLimit, thesisLimit }),
    });

    return ok({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}
