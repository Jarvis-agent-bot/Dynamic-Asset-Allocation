import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { MARKET_DATA_USER_AGENT } from "@/src/market/constants";
import { appendDaaExternalRequestLog } from "@/src/daa/store/jobStore";
type YahooRssItem = {
  title: string;
  link?: string;
  pubDate?: string;
  summary?: string;
};

type YahooRssFetchResult = {
  symbol: string;
  requestUrl: string;
  status: number;
  responseHeaders: Record<string, string>;
  payloadText: string;
  items: YahooRssItem[];
};

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseYahooRssXml(xml: string, limit = 50): YahooRssItem[] {
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const titleRe = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/;
  const linkRe = /<link>([\s\S]*?)<\/link>/;
  const pubRe = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const descRe = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/;

  const items: YahooRssItem[] = [];
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
    if (items.length >= Math.max(1, limit)) break;
  }

  return items;
}

function extractHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function recordYahooRssRequest(input: {
  symbol: string;
  status: number;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
}): Promise<void> {
  try {
    await appendDaaExternalRequestLog({
      provider: "yahoo",
      resource: "yahoo.rss",
      subjectKey: input.symbol,
      endpointHost: "feeds.finance.yahoo.com",
      httpStatus: input.status,
      errorCode: input.errorCode ?? "",
      errorMessage: input.errorMessage ?? "",
      latencyMs: input.latencyMs,
      retryCount: 0,
      cacheStatus: "cache_bypass",
      caller: "fetchYahooRssFeedBySymbol",
    });
  } catch (err) {
    logSwallowed("yahooRssFetch.recordRequest", err);
  }
}

export async function fetchYahooRssFeedBySymbol(symbolRaw: string, limit = 20): Promise<YahooRssFetchResult> {
  const symbol = String(symbolRaw || "").trim().toUpperCase();
  if (!symbol) {
    return {
      symbol: "",
      requestUrl: "",
      status: 0,
      responseHeaders: {},
      payloadText: "",
      items: [],
    };
  }

  const rss = new URL("https://feeds.finance.yahoo.com/rss/2.0/headline");
  rss.searchParams.set("s", symbol);
  rss.searchParams.set("region", "US");
  rss.searchParams.set("lang", "en-US");

  try {
    const startedAt = Date.now();
    const response = await fetch(rss, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "user-agent": MARKET_DATA_USER_AGENT,
      },
    });

    const xml = await response.text();
    await recordYahooRssRequest({
      symbol,
      status: response.status,
      errorCode: response.ok ? "" : `http_${response.status}`,
      errorMessage: response.ok ? "" : "Yahoo RSS upstream error",
      latencyMs: Math.max(0, Date.now() - startedAt),
    });
    if (!response.ok) {
      return {
        symbol,
        requestUrl: rss.toString(),
        status: response.status,
        responseHeaders: extractHeaders(response.headers),
        payloadText: xml,
        items: [],
      };
    }

    return {
      symbol,
      requestUrl: rss.toString(),
      status: response.status,
      responseHeaders: extractHeaders(response.headers),
      payloadText: xml,
      items: parseYahooRssXml(xml, limit),
    };
  } catch (err) {
    logSwallowed("yahooRssFetch.fetchFeed", err);
    await recordYahooRssRequest({
      symbol,
      status: 0,
      errorCode: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network_error",
      errorMessage: err instanceof Error ? err.message : String(err),
      latencyMs: 0,
    });
    return {
      symbol,
      requestUrl: rss.toString(),
      status: 0,
      responseHeaders: {},
      payloadText: "",
      items: [],
    };
  }
}

export async function fetchYahooRssItemsBySymbol(symbolRaw: string, limit = 20): Promise<YahooRssItem[]> {
  const result = await fetchYahooRssFeedBySymbol(symbolRaw, limit);
  return result.items;
}

export function parseSymbolsFromNewsQuery(queryRaw: string): string[] {
  const query = String(queryRaw || "").trim();
  if (!query) return [];

  const parts = query
    .split(/\bOR\b|\bAND\b|,|;|\s+/i)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
    .filter((x) => !["OR", "AND", "NOT"].includes(x));

  const out = new Set<string>();
  for (const token of parts) {
    if (/^[A-Z][A-Z0-9._-]{0,11}$/.test(token)) {
      out.add(token);
    }
  }
  return [...out];
}
