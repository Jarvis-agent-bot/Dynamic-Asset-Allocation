import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runHumanIngest } from "@/src/daa/hf/hfService";
import { runLoggedJob } from "@/src/daa/jobs/jobService";

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
      jobType: "cron_hf_ingest",
      triggerSource: "cron_hf_ingest",
      handler: async () => {
        const { summary, batch } = await runHumanIngest({});
        return { summary, batch };
      },
      summarize: (result) => ({
        signalCount: result.batch.signals.length,
        sourceStatus: result.summary.sourceStatus,
        diagnostics: result.summary.diagnostics,
      }),
    });

    return ok({
      summary: execution.result.summary,
      signalCount: execution.result.batch.signals.length,
      asOfDate: execution.result.batch.asOfDate,
      generatedAt: execution.result.batch.generatedAt,
      jobId: execution.jobId,
    });
  });
}
