import { NextResponse } from "next/server";
import { fetchYahooRssItemsBySymbolV1 } from "@/src/market/yahooRssFetchV1";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Minimal Yahoo Finance RSS fetch (server-side) to avoid browser CORS.
// Example: /api/daa/market/yahoo/rss?symbol=AAPL
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim();
    if (!symbol) return json({ error: "missing symbol" }, { status: 400 });

    const items = await fetchYahooRssItemsBySymbolV1(symbol, 50);

    return json({ ok: true, source: "yahoo-rss", symbol: symbol.toUpperCase(), items });
  } catch (e) {
    return json(
      {
        error: "yahoo rss fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
