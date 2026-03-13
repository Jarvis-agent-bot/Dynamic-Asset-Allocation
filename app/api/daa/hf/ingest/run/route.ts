import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getHumanIngestRuntimeState, getLatestHumanSignalBatch, runHumanIngest } from "@/src/daa/hf/hfService";

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
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    await getLatestHumanSignalBatch({ autoIngestOnMiss: false });
    const state = getHumanIngestRuntimeState();

    return ok({
      lastIngestAt: state.lastIngestAt,
      ingestCount: state.ingestCount,
      hasBatch: Boolean(state.latestBatch),
      latestBatchAsOfDate: state.latestBatch?.asOfDate ?? null,
      latestSignalCount: state.latestBatch?.signals.length ?? 0,
    });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<IngestBody>(req);

    const marketScope = normalizeMarketScope(body?.marketScope);
    const reportDates = Array.isArray(body?.reportDates)
      ? body.reportDates.map((x) => String(x || "").trim()).filter(Boolean)
      : undefined;
    const fundCodes = normalizeFundCodes(body?.fundCodes);
    const { summary, batch } = await runHumanIngest({ marketScope, reportDates, fundCodes });

    return ok({
      summary,
      batch,
    });
  });
}
