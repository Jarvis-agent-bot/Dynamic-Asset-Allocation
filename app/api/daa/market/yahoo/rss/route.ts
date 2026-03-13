import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { fetchYahooRssItemsBySymbol } from "@/src/market/yahooRssFetch";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    try {
      const url = new URL(req.url);
      const symbol = url.searchParams.get("symbol")?.trim();
      if (!symbol) {
        return fail("VALIDATION_FAILED", "missing symbol", { status: 400 });
      }

      const items = await fetchYahooRssItemsBySymbol(symbol, 50);

      return ok({
        source: "yahoo-rss",
        symbol: symbol.toUpperCase(),
        items,
      });
    } catch (error) {
      return fail("INTERNAL_ERROR", "yahoo rss fetch failed", {
        status: 500,
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
