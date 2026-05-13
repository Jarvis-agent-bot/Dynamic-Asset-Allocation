import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildTechnicalSignalForSymbol } from "@/src/daa/signals/technicalSignal";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const symbol = String(url.searchParams.get("symbol") || "").trim();
    if (!symbol) {
      return fail("VALIDATION_FAILED", "missing symbol", { status: 400 });
    }

    const signal = await buildTechnicalSignalForSymbol(symbol);
    return ok({
      symbol,
      signal,
      unavailableReason: signal ? null : "not_enough_price_history",
    });
  });
}
