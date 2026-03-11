import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { fetchYahooRssItemsBySymbolV1 } from "@/src/market/yahooRssFetchV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    try {
      const url = new URL(req.url);
      const symbol = url.searchParams.get("symbol")?.trim();
      if (!symbol) {
        return failV1("VALIDATION_FAILED", "missing symbol", { status: 400 });
      }

      const items = await fetchYahooRssItemsBySymbolV1(symbol, 50);

      return okV1({
        source: "yahoo-rss",
        symbol: symbol.toUpperCase(),
        items,
      });
    } catch (error) {
      return failV1("INTERNAL_ERROR", "yahoo rss fetch failed", {
        status: 500,
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
