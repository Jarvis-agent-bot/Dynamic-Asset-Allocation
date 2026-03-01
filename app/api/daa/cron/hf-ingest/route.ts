import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { runHumanIngestV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const { summary, batch } = await runHumanIngestV1({});
    return okV1({
      summary,
      signalCount: batch.signals.length,
      asOfDate: batch.asOfDate,
      generatedAt: batch.generatedAt,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
