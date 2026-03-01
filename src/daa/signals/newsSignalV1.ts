import { fetchYahooRssItemsBySymbolV1, parseSymbolsFromNewsQueryV1 } from "@/src/market/yahooRssFetchV1";

export type DaaNewsSignalItemV1 = {
  symbol: string;
  title: string;
  link: string | null;
  ts: string;
  sentimentScore: number;
  sourceCredibility: number;
  freshness: number;
};

export type DaaNewsSignalV1 = {
  symbol: string;
  scorePct: number;
  confidencePct: number;
  evidenceCount: number;
  reasons: string[];
  items: DaaNewsSignalItemV1[];
};

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function domainFromLink(link: string | null | undefined): string {
  const text = String(link || "").trim();
  if (!text) return "";
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function sourceCredibilityByDomain(domain: string): number {
  const value = String(domain || "").toLowerCase();
  if (!value) return 0.65;

  const official = ["sec.gov", "hkex.com.hk", "sse.com.cn", "szse.cn", "gov.cn"];
  const mainstream = ["reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "yahoo.com"];
  const medium = ["marketwatch.com", "investing.com", "finance.yahoo.com", "benzinga.com"];

  if (official.some((x) => value === x || value.endsWith(`.${x}`))) return 1;
  if (mainstream.some((x) => value === x || value.endsWith(`.${x}`))) return 0.88;
  if (medium.some((x) => value === x || value.endsWith(`.${x}`))) return 0.75;
  return 0.62;
}

const POSITIVE_TERMS = [
  "beat",
  "surge",
  "upgrade",
  "buyback",
  "record",
  "outperform",
  "growth",
  "获批",
  "增长",
  "上调",
  "创新高",
  "回购",
];

const NEGATIVE_TERMS = [
  "downgrade",
  "lawsuit",
  "fraud",
  "probe",
  "drop",
  "decline",
  "risk",
  "warning",
  "亏损",
  "下调",
  "裁员",
  "调查",
  "违约",
  "暴跌",
];

function sentimentFromText(text: string): number {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return 0;

  let score = 0;
  for (const token of POSITIVE_TERMS) {
    if (normalized.includes(token.toLowerCase())) score += 1;
  }
  for (const token of NEGATIVE_TERMS) {
    if (normalized.includes(token.toLowerCase())) score -= 1;
  }

  return clamp(score / 3, -1, 1);
}

function freshnessDecayByTs(ts: string): number {
  const ms = Date.parse(String(ts || ""));
  if (!Number.isFinite(ms)) return 0.4;
  const ageHours = Math.max(0, (Date.now() - ms) / 3600000);
  const halfLifeHours = 72;
  const decay = 2 ** (-ageHours / halfLifeHours);
  return clamp(decay, 0.08, 1);
}

function parseTs(pubDate: string | undefined): string {
  const raw = String(pubDate || "").trim();
  if (!raw) return new Date().toISOString();
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function scoreFromNewsItem(item: DaaNewsSignalItemV1): number {
  const base = 55 + item.sentimentScore * 22;
  const adjusted = base * item.sourceCredibility * item.freshness;
  return clamp(adjusted, 0, 100);
}

export async function buildNewsSignalForSymbolV1(symbol: string): Promise<DaaNewsSignalV1 | null> {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return null;

  const rssItems = await fetchYahooRssItemsBySymbolV1(normalized, 25);
  if (!rssItems.length) {
    return {
      symbol: normalized,
      scorePct: 50,
      confidencePct: 35,
      evidenceCount: 0,
      reasons: ["无近期新闻样本"],
      items: [],
    };
  }

  const items: DaaNewsSignalItemV1[] = rssItems.map((item) => {
    const text = `${item.title} ${item.summary || ""}`.trim();
    const ts = parseTs(item.pubDate);
    const domain = domainFromLink(item.link);
    return {
      symbol: normalized,
      title: item.title,
      link: item.link || null,
      ts,
      sentimentScore: sentimentFromText(text),
      sourceCredibility: sourceCredibilityByDomain(domain),
      freshness: freshnessDecayByTs(ts),
    };
  });

  const totalWeight = items.reduce((acc, item) => acc + item.sourceCredibility * item.freshness, 0);
  const scorePct = totalWeight > 0
    ? items.reduce((acc, item) => acc + scoreFromNewsItem(item), 0) / items.length
    : 50;

  const positiveCount = items.filter((item) => item.sentimentScore > 0.2).length;
  const negativeCount = items.filter((item) => item.sentimentScore < -0.2).length;

  const confidencePct = clamp(
    35
    + Math.min(35, items.length * 4)
    + Math.min(20, totalWeight * 3)
    - (positiveCount > 0 && negativeCount > 0 ? 8 : 0),
    0,
    100,
  );

  const reasons: string[] = [];
  if (positiveCount > negativeCount) reasons.push("新闻情绪偏正面");
  else if (negativeCount > positiveCount) reasons.push("新闻情绪偏负面");
  else reasons.push("新闻情绪中性");
  reasons.push(`采样${items.length}条资讯`);

  return {
    symbol: normalized,
    scorePct: Number(clamp(scorePct, 0, 100).toFixed(2)),
    confidencePct: Number(confidencePct.toFixed(2)),
    evidenceCount: items.length,
    reasons,
    items: items
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 12),
  };
}

export async function buildNewsSignalsV1(opts: {
  symbols?: string[];
  query?: string;
}): Promise<DaaNewsSignalV1[]> {
  const manualSymbols = Array.isArray(opts.symbols)
    ? opts.symbols.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean)
    : [];
  const querySymbols = parseSymbolsFromNewsQueryV1(opts.query || "");
  const symbols = [...new Set([...manualSymbols, ...querySymbols])];
  if (!symbols.length) return [];

  const out: DaaNewsSignalV1[] = [];
  for (const symbol of symbols) {
    const signal = await buildNewsSignalForSymbolV1(symbol);
    if (signal) out.push(signal);
  }
  return out;
}
