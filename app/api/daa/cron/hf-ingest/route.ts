import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runHumanIngest } from "@/src/daa/hf/hfService";
import { appendDaaIngestJobLog } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const startedAt = new Date().toISOString();
    try {
      const { summary, batch } = await runHumanIngest({});
      const failureCount = summary.sourceStatus === "fallback_seed" ? 1 : 0;
      await appendDaaIngestJobLog({
        jobType: "cron_hf_ingest",
        triggerSource: "cron_hf_ingest",
        status: failureCount > 0 ? "partial" : "ok",
        startedAt,
        finishedAt: new Date().toISOString(),
        totalCount: Math.max(1, summary.signalCount),
        successCount: summary.signalCount,
        failureCount,
        diagnosticsJson: {
          sourceStatus: summary.sourceStatus,
          diagnostics: summary.diagnostics,
        },
      });
      return ok({
        summary,
        signalCount: batch.signals.length,
        asOfDate: batch.asOfDate,
        generatedAt: batch.generatedAt,
      });
    } catch (error) {
      try {
        await appendDaaIngestJobLog({
          jobType: "cron_hf_ingest",
          triggerSource: "cron_hf_ingest",
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          totalCount: 1,
          successCount: 0,
          failureCount: 1,
          diagnosticsJson: {
            error: describeError(error),
          },
        });
      } catch (err) {
  logSwallowed("hfIngestRoute.jobLog", err);
      }
      throw error;
    }
  });
}

export async function GET(req: Request) {
  return POST(req);
}
