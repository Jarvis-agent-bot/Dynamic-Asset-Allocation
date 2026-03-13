import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getMarketCacheHealth } from "@/src/daa/modules/marketCache/marketCacheService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const provider = String(url.searchParams.get("provider") || "yfinance").trim() || "yfinance";
    const stats = await getMarketCacheHealth(provider);
    return ok(stats);
  });
}
