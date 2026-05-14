import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listDaaExternalRequestLogs } from "@/src/daa/store/jobStore";

export const runtime = "nodejs";

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const provider = url.searchParams.get("provider")?.trim() || undefined;
    const sinceHours = clampInt(url.searchParams.get("sinceHours"), 24, 1, 720);
    const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);
    const result = await listDaaExternalRequestLogs({ provider, sinceHours, limit });

    return ok({
      provider: provider ?? "ALL",
      sinceHours,
      limit,
      ...result,
    });
  });
}
