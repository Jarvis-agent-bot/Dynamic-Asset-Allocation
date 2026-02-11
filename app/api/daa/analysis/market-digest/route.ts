import { NextResponse } from "next/server";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function mustBeLocalhost(req: Request) {
  const url = new URL(req.url);
  const h = url.hostname;
  // This endpoint is designed for VPS-local cron usage (ssh + curl to 127.0.0.1:3000).
  // We intentionally reject public hostnames to avoid turning server-side tokens into a public API.
  if (h !== "127.0.0.1" && h !== "localhost" && h !== "::1") {
    throw new Error(`forbidden host: ${h}`);
  }
  return url;
}

type DigestTweet = {
  id?: string;
  created_at?: string;
  text: string;
  author?: string;
  url?: string;
};

function extractTwitterdataTweets(payload: any): DigestTweet[] {
  const out: DigestTweet[] = [];

  const addTweet = (tweet: any) => {
    const restId = String(tweet?.rest_id ?? tweet?.id_str ?? tweet?.legacy?.id_str ?? "").trim();
    const legacy = tweet?.legacy ?? {};
    const userLegacy = tweet?.core?.user_results?.result?.legacy ?? tweet?.core?.user_results?.result ?? {};
    const screenName = String(userLegacy?.screen_name ?? "").trim();

    const text = String(legacy?.full_text ?? legacy?.text ?? "").trim();
    const createdAt = String(legacy?.created_at ?? "").trim();

    if (!text) return;

    const author = screenName ? `@${screenName}` : undefined;
    const url = screenName && restId ? `https://x.com/${screenName}/status/${restId}` : undefined;

    out.push({
      id: restId || undefined,
      created_at: createdAt || undefined,
      text,
      author,
      url,
    });
  };

  const visitEntry = (entry: any) => {
    const content = entry?.content ?? entry;

    const tweet1 = content?.itemContent?.tweet_results?.result;
    if (tweet1) addTweet(tweet1);

    const items = content?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const tweet2 = it?.item?.itemContent?.tweet_results?.result ?? it?.itemContent?.tweet_results?.result;
        if (tweet2) addTweet(tweet2);
      }
    }

    const modItems = content?.content?.items;
    if (Array.isArray(modItems)) {
      for (const it of modItems) {
        const tweet3 = it?.item?.itemContent?.tweet_results?.result ?? it?.itemContent?.tweet_results?.result;
        if (tweet3) addTweet(tweet3);
      }
    }
  };

  const seenInst = new Set<any>();
  const collectInstructions = (node: any, depth: number) => {
    if (!node || depth > 10) return;
    if (Array.isArray(node)) return;
    if (typeof node !== "object") return;

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "instructions" && Array.isArray(v) && !seenInst.has(v)) {
        seenInst.add(v);
        for (const inst of v) {
          const entries = (inst as any)?.entries;
          if (!Array.isArray(entries)) continue;
          for (const e of entries) visitEntry(e);
        }
        continue;
      }

      if (v && typeof v === "object" && !Array.isArray(v)) {
        collectInstructions(v, depth + 1);
      }
    }
  };

  collectInstructions(payload, 0);

  // De-dupe by (id) else (text).
  const out2: DigestTweet[] = [];
  const seen = new Set<string>();
  for (const t of out) {
    const k = String(t.id || t.text).trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out2.push(t);
  }
  return out2;
}

function clip(s: string, n: number): string {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "…";
}

export async function GET(req: Request) {
  try {
    const url = mustBeLocalhost(req);

    const listId = url.searchParams.get("listId")?.trim() || "1898757620019908725";
    const yahooSymbol = url.searchParams.get("yahooSymbol")?.trim() || "AAPL";
    const xueqiuSymbol = url.searchParams.get("xueqiuSymbol")?.trim() || "SH000001";

    const tweetsLimit = Math.min(50, Math.max(1, Number(url.searchParams.get("tweetsLimit") ?? "10")));

    // Use same-origin internal routes so tokens stay server-side.
    const origin = url.origin;

    const [tw, yf, xq] = await Promise.all([
      fetch(`${origin}/api/daa/market/twitter/list?listId=${encodeURIComponent(listId)}&limit=${encodeURIComponent(String(Math.max(20, tweetsLimit)))}`, {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch(`${origin}/api/daa/market/yahoo/rss?symbol=${encodeURIComponent(yahooSymbol)}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${origin}/api/daa/market/xueqiu/quotec?symbol=${encodeURIComponent(xueqiuSymbol)}`, { cache: "no-store" }).then((r) => r.json()),
    ]);

    const tweets = extractTwitterdataTweets((tw as any)?.payload).slice(0, tweetsLimit);

    const yahooItems: any[] = Array.isArray((yf as any)?.items) ? (yf as any).items : [];
    const xqQuote = (xq as any)?.payload?.data?.[0] ?? (xq as any)?.payload?.data?.quote ?? (xq as any)?.payload?.data ?? (xq as any)?.payload;

    const lines: string[] = [];
    lines.push(`[DAA][MarketDigest] list=${listId} yahoo=${yahooSymbol} xq=${xueqiuSymbol}`);
    lines.push(`- tweets: ${tweets.length}, yahoo items: ${yahooItems.length}`);

    for (const t of tweets.slice(0, Math.min(3, tweets.length))) {
      const head = `${t.author ? t.author + ": " : ""}${clip(t.text.replace(/\s+/g, " "), 160)}`;
      lines.push(`- ${head}${t.url ? " (" + t.url + ")" : ""}`);
    }

    if (yahooItems.length) {
      const it = yahooItems[0];
      const title = clip(String(it?.title ?? ""), 140);
      const link = String(it?.link ?? "");
      if (title) lines.push(`- yahoo top: ${title}${link ? " (" + link + ")" : ""}`);
    }

    if (xqQuote) {
      const name = String(xqQuote?.name ?? xqQuote?.symbol ?? xueqiuSymbol);
      const last = xqQuote?.current ?? xqQuote?.last ?? xqQuote?.price;
      const chg = xqQuote?.percent ?? xqQuote?.percent_change ?? xqQuote?.change;
      const brief = `${name}${last !== undefined ? " last=" + String(last) : ""}${chg !== undefined ? " chg=" + String(chg) : ""}`;
      lines.push(`- xq quote: ${clip(brief, 160)}`);
    }

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      inputs: { listId, yahooSymbol, xueqiuSymbol, tweetsLimit },
      tweets,
      yahooItems: yahooItems.slice(0, 10),
      xueqiuQuote: xqQuote,
      digestText: lines.join("\n"),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isForbidden = msg.startsWith("forbidden host:");
    return json(
      {
        error: isForbidden ? "forbidden" : "market digest failed",
        message: msg,
      },
      { status: isForbidden ? 403 : 500 },
    );
  }
}
