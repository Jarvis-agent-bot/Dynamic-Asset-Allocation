export type YahooRssItemV1 = {
  title: string;
  link?: string;
  pubDate?: string;
  summary?: string;
};

export type YahooRssFetchResultV1 = {
  symbol: string;
  requestUrl: string;
  status: number;
  responseHeaders: Record<string, string>;
  payloadText: string;
  items: YahooRssItemV1[];
};

function stripTagsV1(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseYahooRssXmlV1(xml: string, limit = 50): YahooRssItemV1[] {
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const titleRe = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/;
  const linkRe = /<link>([\s\S]*?)<\/link>/;
  const pubRe = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const descRe = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/;

  const items: YahooRssItemV1[] = [];
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = itemRe.exec(xml))) {
    const chunk = m[1] ?? "";
    const titleM = titleRe.exec(chunk);
    const title = stripTagsV1((titleM?.[1] ?? titleM?.[2] ?? "").trim());
    if (!title) continue;

    const link = (linkRe.exec(chunk)?.[1] ?? "").trim() || undefined;
    const pubDate = (pubRe.exec(chunk)?.[1] ?? "").trim() || undefined;
    const descM = descRe.exec(chunk);
    const summary = stripTagsV1((descM?.[1] ?? descM?.[2] ?? "").trim()) || undefined;

    items.push({ title, link, pubDate, summary });
    if (items.length >= Math.max(1, limit)) break;
  }

  return items;
}

function extractHeadersV1(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export async function fetchYahooRssFeedBySymbolV1(symbolRaw: string, limit = 20): Promise<YahooRssFetchResultV1> {
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
    const response = await fetch(rss, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
    });

    const xml = await response.text();
    if (!response.ok) {
      return {
        symbol,
        requestUrl: rss.toString(),
        status: response.status,
        responseHeaders: extractHeadersV1(response.headers),
        payloadText: xml,
        items: [],
      };
    }

    return {
      symbol,
      requestUrl: rss.toString(),
      status: response.status,
      responseHeaders: extractHeadersV1(response.headers),
      payloadText: xml,
      items: parseYahooRssXmlV1(xml, limit),
    };
  } catch {
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

export async function fetchYahooRssItemsBySymbolV1(symbolRaw: string, limit = 20): Promise<YahooRssItemV1[]> {
  const result = await fetchYahooRssFeedBySymbolV1(symbolRaw, limit);
  return result.items;
}

export function parseSymbolsFromNewsQueryV1(queryRaw: string): string[] {
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
