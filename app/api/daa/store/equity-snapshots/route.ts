import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseDaaEquitySnapshotInput } from "@/src/daa/api/storePayloadValidators";
import { appendDaaEquitySnapshot, listDaaEquitySnapshots } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

function toLimit(value: string | null): number {
  const parsed = Number(value || 200);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const snapshots = await listDaaEquitySnapshots(toLimit(url.searchParams.get("limit")));
    return ok({ snapshots });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ snapshot?: unknown }>(req);
    const parsed = parseDaaEquitySnapshotInput(body?.snapshot);
    if (!parsed.ok) return fail("VALIDATION_FAILED", parsed.message, { status: 400 });

    const snapshot = await appendDaaEquitySnapshot(parsed.value);
    return ok({ snapshot });
  });
}
