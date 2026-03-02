import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getHumanIngestRuntimeStateV1, getLatestHumanSignalBatchV1, runHumanIngestV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

type IngestBody = {
  marketScope?: string[];
  reportDates?: string[];
  fundCodes?: string[];
};

function normalizeMarketScope(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function normalizeFundCodes(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    await getLatestHumanSignalBatchV1({ autoIngestOnMiss: false });
    const state = getHumanIngestRuntimeStateV1();

    return okV1({
      lastIngestAt: state.lastIngestAt,
      ingestCount: state.ingestCount,
      hasBatch: Boolean(state.latestBatch),
      latestBatchAsOfDate: state.latestBatch?.asOfDate ?? null,
      latestSignalCount: state.latestBatch?.signals.length ?? 0,
    });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<IngestBody>(req);

    const marketScope = normalizeMarketScope(body?.marketScope);
    const reportDates = Array.isArray(body?.reportDates)
      ? body.reportDates.map((x) => String(x || "").trim()).filter(Boolean)
      : undefined;
    const fundCodes = normalizeFundCodes(body?.fundCodes);
    const { summary, batch } = await runHumanIngestV1({ marketScope, reportDates, fundCodes });

    return okV1({
      summary,
      batch,
    });
  });
}
