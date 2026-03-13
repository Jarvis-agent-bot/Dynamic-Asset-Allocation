import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildTradesReadModel } from "@/src/daa/modules/read/tradesReadService";
import { buildDevMemTradesReadModel, shouldUseDevMemFallback } from "@/src/daa/devMemFallback";

export const runtime = "nodejs";

function toNumber(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallback(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponse(authResult);
    if (denied) {
      if (shouldUseDevMemFallback()) return ok(buildDevMemTradesReadModel());
      return denied;
    }
    const { searchParams } = new URL(req.url);
    try {
      return ok(await buildTradesReadModel({
        tradeLimit: toNumber(searchParams.get("tradeLimit"), 150),
        reportLimit: toNumber(searchParams.get("reportLimit"), 120),
      }));
    } catch (error) {
      if (shouldUseDevMemFallback(error)) return ok(buildDevMemTradesReadModel());
      throw error;
    }
  });
}
