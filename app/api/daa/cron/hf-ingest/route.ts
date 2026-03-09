import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { runHumanIngestV1 } from "@/src/daa/hf/hfServiceV1";
import { appendDaaIngestJobLogV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function describeErrorV1(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const startedAt = new Date().toISOString();
    try {
      const { summary, batch } = await runHumanIngestV1({});
      const failureCount = summary.sourceStatus === "fallback_seed" ? 1 : 0;
      await appendDaaIngestJobLogV1({
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
      return okV1({
        summary,
        signalCount: batch.signals.length,
        asOfDate: batch.asOfDate,
        generatedAt: batch.generatedAt,
      });
    } catch (error) {
      try {
        await appendDaaIngestJobLogV1({
          jobType: "cron_hf_ingest",
          triggerSource: "cron_hf_ingest",
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          totalCount: 1,
          successCount: 0,
          failureCount: 1,
          diagnosticsJson: {
            error: describeErrorV1(error),
          },
        });
      } catch {
        // ignore job log failure
      }
      throw error;
    }
  });
}

export async function GET(req: Request) {
  return POST(req);
}
