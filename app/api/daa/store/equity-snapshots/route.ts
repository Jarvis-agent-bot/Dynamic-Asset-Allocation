import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { appendDaaEquitySnapshotV1, listDaaEquitySnapshotsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function toLimit(value: string | null): number {
  const parsed = Number(value || 200);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const snapshots = await listDaaEquitySnapshotsV1(toLimit(url.searchParams.get("limit")));
    return okV1({ snapshots });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ snapshot?: unknown }>(req);
    if (!isRecord(body?.snapshot)) {
      return failV1("VALIDATION_FAILED", "snapshot must be an object", { status: 400 });
    }

    const snapshot = await appendDaaEquitySnapshotV1(body.snapshot as any);
    return okV1({ snapshot });
  });
}
