import { NextResponse } from "next/server";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Minimal Yahoo Finance RSS fetch (server-side) to avoid browser CORS.
// Example: /api/daa/market/yahoo/rss?symbol=AAPL
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim();
    if (!symbol) return json({ error: "missing symbol" }, { status: 400 });

    const rss = new URL("https://feeds.finance.yahoo.com/rss/2.0/headline");
    rss.searchParams.set("s", symbol);
    rss.searchParams.set("region", "US");
    rss.searchParams.set("lang", "en-US");

    const r = await fetch(rss, { cache: "no-store" });
    const xml = await r.text();
    if (!r.ok) {
      return json({ error: "yahoo rss upstream error", status: r.status, body: xml.slice(0, 2000) }, { status: 502 });
    }

    // Very small XML extraction (avoid dependencies).
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const titleRe = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/;
    const linkRe = /<link>([\s\S]*?)<\/link>/;
    const pubRe = /<pubDate>([\s\S]*?)<\/pubDate>/;
    const descRe = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/;

    const items: Array<{ title: string; link?: string; pubDate?: string; summary?: string }> = [];
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = itemRe.exec(xml))) {
      const chunk = m[1] ?? "";
      const titleM = titleRe.exec(chunk);
      const title = stripTags((titleM?.[1] ?? titleM?.[2] ?? "").trim());
      if (!title) continue;

      const link = (linkRe.exec(chunk)?.[1] ?? "").trim() || undefined;
      const pubDate = (pubRe.exec(chunk)?.[1] ?? "").trim() || undefined;
      const descM = descRe.exec(chunk);
      const summary = stripTags((descM?.[1] ?? descM?.[2] ?? "").trim()) || undefined;

      items.push({ title, link, pubDate, summary });
      if (items.length >= 50) break;
    }

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
