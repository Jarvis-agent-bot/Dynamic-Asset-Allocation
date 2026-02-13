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

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  const t = v ? v.trim() : "";
  return t ? t : undefined;
}

type UpstreamResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status?: number; error: string };

async function fetchTextWithTimeout(url: URL, init: RequestInit, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string }> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(id);
  }
}

async function fetchTwitterListLatestTweets(listId: string, limit: number, timeoutMs: number): Promise<UpstreamResult<{ payload: unknown }>> {
  const token = getEnv("TWITTERDATA_TOKEN");
  if (!token) return { ok: false, error: "missing env: TWITTERDATA_TOKEN" };

  const upstream = new URL("https://pro.twitterdata.com/ListLatestTweetsTimeline");
  upstream.searchParams.set("listId", listId);
  upstream.searchParams.set("token", token);
  upstream.searchParams.set("limit", String(Math.min(200, Math.max(1, Math.trunc(limit)))));

  try {
    const { ok, status, text } = await fetchTextWithTimeout(
      upstream,
      {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        cache: "no-store",
      },
      timeoutMs,
    );

    if (!ok) {
      // Avoid echoing upstream body; it may include request details.
      return { ok: false, status, error: "twitterdata upstream error" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return { ok: true, status, data: { payload } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchYahooRss(symbol: string, timeoutMs: number): Promise<UpstreamResult<{ items: Array<{ title: string; link?: string; pubDate?: string; summary?: string }> }>> {
  const rss = new URL("https://feeds.finance.yahoo.com/rss/2.0/headline");
  rss.searchParams.set("s", symbol);
  rss.searchParams.set("region", "US");
  rss.searchParams.set("lang", "en-US");

  try {
    const { ok, status, text: xml } = await fetchTextWithTimeout(rss, { cache: "no-store" }, timeoutMs);
    if (!ok) {
      return { ok: false, status, error: "yahoo rss upstream error" };
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

    return { ok: true, status, data: { items } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchXueqiuQuotec(symbol: string, timeoutMs: number): Promise<UpstreamResult<{ payload: unknown }>> {
  const cookie = getEnv("XUEQIU_TOKEN");
  if (!cookie) return { ok: false, error: "missing env: XUEQIU_TOKEN" };

  const upstream = new URL("https://stock.xueqiu.com/v5/stock/realtime/quotec.json");
  upstream.searchParams.set("symbol", symbol);
  upstream.searchParams.set("_", String(Date.now()));

  try {
    const { ok, status, text } = await fetchTextWithTimeout(
      upstream,
      {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          cookie,
          origin: "https://xueqiu.com",
          referer: `https://xueqiu.com/S/${symbol}`,
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
        cache: "no-store",
      },
      timeoutMs,
    );

    if (!ok) {
      // Avoid echoing upstream body; it may contain auth-related hints.
      return { ok: false, status, error: "xueqiu upstream error" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return { ok: true, status, data: { payload } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  try {
    const url = mustBeLocalhost(req);

    const listId = url.searchParams.get("listId")?.trim() || "1898757620019908725";
    const yahooSymbol = url.searchParams.get("yahooSymbol")?.trim() || "AAPL";
    const xueqiuSymbol = url.searchParams.get("xueqiuSymbol")?.trim() || "SH000001";

    const tweetsLimit = Math.min(50, Math.max(1, Number(url.searchParams.get("tweetsLimit") ?? "10")));

    // Cron should never hang forever: keep each upstream bounded.
    const perUpstreamTimeoutMs = Math.min(25_000, Math.max(1_000, Number(url.searchParams.get("timeoutMs") ?? "8000")));

    const [tw, yf, xq] = await Promise.all([
      fetchTwitterListLatestTweets(listId, Math.max(20, tweetsLimit), perUpstreamTimeoutMs),
      fetchYahooRss(yahooSymbol, perUpstreamTimeoutMs),
      fetchXueqiuQuotec(xueqiuSymbol, perUpstreamTimeoutMs),
    ]);

    const tweets = tw.ok ? extractTwitterdataTweets((tw.data as any)?.payload).slice(0, tweetsLimit) : [];

    const yahooItems: any[] = yf.ok && Array.isArray((yf.data as any)?.items) ? (yf.data as any).items : [];
    const xqPayload = xq.ok ? (xq.data as any)?.payload : undefined;
    const xqQuote = (xqPayload as any)?.data?.[0] ?? (xqPayload as any)?.data?.quote ?? (xqPayload as any)?.data ?? xqPayload;

    const sources = {
      twitter: tw.ok ? { ok: true, status: tw.status } : { ok: false, status: tw.status, error: tw.error },
      yahoo: yf.ok ? { ok: true, status: yf.status } : { ok: false, status: yf.status, error: yf.error },
      xueqiu: xq.ok ? { ok: true, status: xq.status } : { ok: false, status: xq.status, error: xq.error },
    };

    const warnings: string[] = [];
    if (!tw.ok) warnings.push(`twitter: ${tw.error}`);
    if (!yf.ok) warnings.push(`yahoo: ${yf.error}`);
    if (!xq.ok) warnings.push(`xueqiu: ${xq.error}`);

    const lines: string[] = [];
    lines.push(`[DAA][MarketDigest] list=${listId} yahoo=${yahooSymbol} xq=${xueqiuSymbol}`);
    lines.push(`- tweets: ${tweets.length}, yahoo items: ${yahooItems.length}`);

    if (warnings.length) {
      lines.push(`- warnings: ${warnings.map((w) => clip(w, 120)).join(" | ")}`);
    }

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
      const name = String((xqQuote as any)?.name ?? (xqQuote as any)?.symbol ?? xueqiuSymbol);
      const last = (xqQuote as any)?.current ?? (xqQuote as any)?.last ?? (xqQuote as any)?.price;
      const chg = (xqQuote as any)?.percent ?? (xqQuote as any)?.percent_change ?? (xqQuote as any)?.change;
      const brief = `${name}${last !== undefined ? " last=" + String(last) : ""}${chg !== undefined ? " chg=" + String(chg) : ""}`;
      lines.push(`- xq quote: ${clip(brief, 160)}`);
    }

    // Make cron happy: never 500 for upstream/network issues.
    // Callers can still check `ok` / `sources` / `warnings` for health.
    const ok = Boolean(tw.ok || yf.ok || xq.ok);

    return json({
      ok,
      generatedAt: new Date().toISOString(),
      inputs: { listId, yahooSymbol, xueqiuSymbol, tweetsLimit, timeoutMs: perUpstreamTimeoutMs },
      sources,
      warnings,
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
