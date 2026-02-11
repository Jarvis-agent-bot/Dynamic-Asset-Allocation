import type { MarketEvent, MarketEventSource } from "./marketEvents";

export type MarketEventCitation = {
  symbol: string;
  eventId: string;
  source: MarketEventSource;
  ts: string;
  title: string;
  summary?: string;
  url?: string;
};

function eventMentionsSymbol(e: MarketEvent, symbol: string): boolean {
  const s = symbol.toLowerCase();
  if (e.symbols?.some((x) => String(x).toLowerCase() === s)) return true;
  const hay = `${e.title} ${e.summary ?? ""}`.toLowerCase();
  return hay.includes(s);
}

export function buildMarketCitations(input: {
  events: MarketEvent[];
  symbols: string[];
  perSymbolLimit?: number;
}): MarketEventCitation[] {
  const { events } = input;
  const perSymbolLimit = input.perSymbolLimit ?? 2;
  const symbols = Array.from(new Set(input.symbols.map((s) => String(s || "").trim()).filter(Boolean)));

  const out: MarketEventCitation[] = [];

  for (const sym of symbols) {
    const hits = events
      .filter((e) => eventMentionsSymbol(e, sym))
      .slice()
      .sort((a, b) => {
        const dt = Date.parse(b.ts) - Date.parse(a.ts);
        if (Number.isFinite(dt) && dt !== 0) return dt;
        return String(a.id).localeCompare(String(b.id));
      })
      .slice(0, perSymbolLimit);

    for (const h of hits) {
      out.push({
        symbol: sym,
        eventId: h.id,
        source: h.source,
        ts: h.ts,
        title: h.title,
        summary: h.summary,
        url: h.url,
      });
    }
  }

  // Stable order makes JSON diffs and tests deterministic.
  out.sort((a, b) => {
    const s = a.symbol.localeCompare(b.symbol);
    if (s !== 0) return s;
    const dt = Date.parse(b.ts) - Date.parse(a.ts);
    if (Number.isFinite(dt) && dt !== 0) return dt;
    return a.eventId.localeCompare(b.eventId);
  });

  return out;
}
