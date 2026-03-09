import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getMarketCacheHealthV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const provider = String(url.searchParams.get("provider") || "yfinance").trim() || "yfinance";
    const stats = await getMarketCacheHealthV1(provider);
    return okV1(stats);
  });
}
