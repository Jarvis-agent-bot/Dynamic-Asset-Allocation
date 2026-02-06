export type MarketEventSource = "twitter" | "news";

export type MarketEvent = {
  id: string;
  source: MarketEventSource;
  ts: string; // ISO string
  title: string;
  summary?: string;
  symbols?: string[];
  url?: string;
  author?: string;
  tags?: string[];
  raw?: unknown; // keep raw payload when ingestion is added
};

export type MarketEventQuery = {
  sources?: MarketEventSource[];
  symbols?: string[];
  sinceTs?: string;
  untilTs?: string;
  limit?: number;
};

export function filterMarketEvents(events: MarketEvent[], q: MarketEventQuery = {}): MarketEvent[] {
  let out = [...events];
  if (q.sources?.length) {
    const allow = new Set(q.sources);
    out = out.filter((e) => allow.has(e.source));
  }
  if (q.symbols?.length) {
    const allow = new Set(q.symbols.map((s) => s.toUpperCase()));
    out = out.filter((e) => (e.symbols || []).some((s) => allow.has(String(s).toUpperCase())));
  }
  if (q.sinceTs) {
    const since = Date.parse(q.sinceTs);
    if (Number.isFinite(since)) out = out.filter((e) => Date.parse(e.ts) >= since);
  }
  if (q.untilTs) {
    const until = Date.parse(q.untilTs);
    if (Number.isFinite(until)) out = out.filter((e) => Date.parse(e.ts) <= until);
  }
  out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  if (q.limit && q.limit > 0) out = out.slice(0, q.limit);
  return out;
}
