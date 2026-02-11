import type { MarketEvent } from "../core/marketEvents";

export type NormalizeResult = { events: MarketEvent[]; issues: string[] };

function toIsoTs(x: unknown): string {
  // Best-effort normalization.
  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return "";

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();

    // Sometimes it's epoch milliseconds/seconds in a string.
    const n = Number(s);
    if (Number.isFinite(n)) {
      const ms = n > 1e12 ? n : n * 1000;
      const d2 = new Date(ms);
      if (!Number.isNaN(d2.getTime())) return d2.toISOString();
    }

    return "";
  }

  if (typeof x === "number" && Number.isFinite(x)) {
    const ms = x > 1e12 ? x : x * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return "";
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickStringArray(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) {
      const arr = v.map((x) => String(x).trim()).filter(Boolean);
      if (arr.length) return arr;
    }
  }
  return [];
}

function uniqUpperSymbols(symbols: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of symbols) {
    const u = s.trim().toUpperCase();
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function extractSymbolsFromText(text: string): string[] {
  const out: string[] = [];
  const re = /\$([A-Za-z]{1,10})\b/g;
  let m: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text))) {
    out.push(m[1] ?? "");
  }
  return uniqUpperSymbols(out);
}

function titleFromText(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const cut = t.split(/[\n\r]/)[0] ?? t;
  return cut.length > 120 ? `${cut.slice(0, 117)}...` : cut;
}

export function normalizeTwitterInput(rawText: string, opts: { defaultAuthor?: string } = {}): NormalizeResult {
  const issues: string[] = [];
  const t = rawText.trim();
  if (!t) return { events: [], issues: ["twitter input is empty"] };

  // Preferred: JSON array payload (from any exporter).
  try {
    const parsed = JSON.parse(t) as unknown;
    const r = normalizeTwitterPayload(parsed, opts);
    if (r.events.length) return r;
  } catch {
    // Fall through to plaintext.
  }

  // Plaintext: one message per non-empty line.
  const lines = t
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!lines.length) return { events: [], issues: ["twitter plaintext has no lines"] };

  const now = new Date();
  const events: MarketEvent[] = lines.map((line, i) => {
    return {
      id: `tw-line-${now.getTime()}-${i}`,
      source: "twitter",
      ts: now.toISOString(),
      title: titleFromText(line),
      summary: line,
      symbols: extractSymbolsFromText(line),
      author: opts.defaultAuthor,
      raw: { line },
    };
  });

  return { events, issues };
}

export function normalizeTwitterPayload(input: unknown, opts: { defaultAuthor?: string } = {}): NormalizeResult {
  const issues: string[] = [];

  if (!Array.isArray(input)) {
    return { events: [], issues: ["twitter payload must be a JSON array"] };
  }

  const events: MarketEvent[] = [];

  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as unknown;
    const obj = (raw ?? {}) as Record<string, unknown>;

    const idRaw = pickString(obj, ["id", "tweet_id", "tweetId", "status_id", "statusId"]);
    const id = idRaw ? `tw-${idRaw}` : `tw-idx-${i}`;

    const text = pickString(obj, ["text", "full_text", "content", "message"]);
    const title = pickString(obj, ["title"]) || titleFromText(text);
    const summary = pickString(obj, ["summary"]) || text || undefined;

    const ts =
      toIsoTs(obj.ts) ||
      toIsoTs(obj.created_at) ||
      toIsoTs(obj.createdAt) ||
      toIsoTs(obj.time) ||
      new Date().toISOString();

    const url = pickString(obj, ["url", "link", "permalink"]);
    const author = pickString(obj, ["author", "user", "username", "screen_name", "screenName"]) || opts.defaultAuthor;

    const symbols = uniqUpperSymbols([
      ...pickStringArray(obj, ["symbols", "tickers", "relatedTickers"]),
      ...extractSymbolsFromText(`${title} ${summary ?? ""}`),
    ]);

    const tags = pickStringArray(obj, ["tags", "topics"]);

    if (!title) {
      issues.push(`twitter item #${i + 1} missing title/text`);
      continue;
    }

    events.push({
      id,
      source: "twitter",
      ts,
      title,
      summary,
      symbols: symbols.length ? symbols : undefined,
      url: url || undefined,
      author: author || undefined,
      tags: tags.length ? tags : undefined,
      raw,
    });
  }

  if (!events.length) issues.push("twitter payload produced 0 events");
  return { events, issues };
}

export function normalizeYahooFinanceNewsInput(rawText: string): NormalizeResult {
  const t = rawText.trim();
  if (!t) return { events: [], issues: ["yfinance input is empty"] };

  try {
    const parsed = JSON.parse(t) as unknown;
    return normalizeYahooFinanceNewsPayload(parsed);
  } catch {
    return { events: [], issues: ["yfinance input must be JSON (array/object)"] };
  }
}

export function normalizeYahooFinanceNewsPayload(input: unknown): NormalizeResult {
  const issues: string[] = [];

  // yfinance python often returns `list[dict]`.
  const arr: unknown[] = Array.isArray(input)
    ? input
    : ((input ?? {}) as Record<string, unknown>).news && Array.isArray(((input ?? {}) as Record<string, unknown>).news)
      ? ((((input ?? {}) as Record<string, unknown>).news as unknown[]) ?? [])
      : [];

  if (!arr.length) {
    return { events: [], issues: ["yfinance payload must be a JSON array (or {news: [...]})"] };
  }

  const events: MarketEvent[] = [];
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i] as unknown;
    const obj = (raw ?? {}) as Record<string, unknown>;

    const idRaw = pickString(obj, ["uuid", "id", "guid"]);
    const id = idRaw ? `news-yf-${idRaw}` : `news-yf-idx-${i}`;

    const title = pickString(obj, ["title", "headline"]);
    const summary = pickString(obj, ["summary", "content", "publisher", "description"]) || undefined;

    const ts =
      toIsoTs(obj.ts) ||
      toIsoTs(obj.providerPublishTime) ||
      toIsoTs(obj.publishTime) ||
      toIsoTs(obj.published_at) ||
      toIsoTs(obj.publishedAt) ||
      new Date().toISOString();

    const url = pickString(obj, ["link", "url"]);
    const symbols = uniqUpperSymbols(pickStringArray(obj, ["relatedTickers", "symbols", "tickers"]));

    if (!title) {
      issues.push(`yfinance item #${i + 1} missing title`);
      continue;
    }

    events.push({
      id,
      source: "news",
      ts,
      title,
      summary,
      symbols: symbols.length ? symbols : undefined,
      url: url || undefined,
      tags: ["yfinance"],
      raw,
    });
  }

  if (!events.length) issues.push("yfinance payload produced 0 events");
  return { events, issues };
}

export function normalizeXueqiuNewsInput(rawText: string): NormalizeResult {
  const t = rawText.trim();
  if (!t) return { events: [], issues: ["xueqiu input is empty"] };

  try {
    const parsed = JSON.parse(t) as unknown;
    return normalizeXueqiuNewsPayload(parsed);
  } catch {
    return { events: [], issues: ["xueqiu input must be JSON (array/object)"] };
  }
}

export function normalizeXueqiuNewsPayload(input: unknown): NormalizeResult {
  const issues: string[] = [];

  const objTop = (input ?? {}) as Record<string, unknown>;
  const arr: unknown[] =
    Array.isArray(input)
      ? input
      : Array.isArray(objTop.items)
        ? (objTop.items as unknown[])
        : Array.isArray(objTop.list)
          ? (objTop.list as unknown[])
          : Array.isArray(objTop.data)
            ? (objTop.data as unknown[])
            : [];

  if (!arr.length) {
    return { events: [], issues: ["xueqiu payload must be a JSON array (or {items|list|data: [...]})"] };
  }

  const events: MarketEvent[] = [];
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i] as unknown;
    const obj = (raw ?? {}) as Record<string, unknown>;

    const idRaw = pickString(obj, ["id", "sid", "unique_id", "uniqueId"]);
    const id = idRaw ? `news-xq-${idRaw}` : `news-xq-idx-${i}`;

    const title = pickString(obj, ["title"]) || titleFromText(pickString(obj, ["text", "summary", "content"])) ;
    const summary = pickString(obj, ["summary", "text", "content"]) || undefined;

    const ts =
      toIsoTs(obj.ts) ||
      toIsoTs(obj.created_at) ||
      toIsoTs(obj.createdAt) ||
      toIsoTs(obj.time) ||
      toIsoTs(obj.created) ||
      new Date().toISOString();

    const url = pickString(obj, ["url", "link", "share_url", "shareUrl"]);

    const symbols = uniqUpperSymbols([
      ...pickStringArray(obj, ["symbols", "tickers", "relatedTickers"]),
      ...extractSymbolsFromText(`${title} ${summary ?? ""}`),
    ]);

    if (!title) {
      issues.push(`xueqiu item #${i + 1} missing title/text`);
      continue;
    }

    events.push({
      id,
      source: "news",
      ts,
      title,
      summary,
      symbols: symbols.length ? symbols : undefined,
      url: url || undefined,
      tags: ["xueqiu"],
      raw,
    });
  }

  if (!events.length) issues.push("xueqiu payload produced 0 events");
  return { events, issues };
}

export function mergeMarketEvents(existing: MarketEvent[], incoming: MarketEvent[]): MarketEvent[] {
  const byId = new Map<string, MarketEvent>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);

  return Array.from(byId.values()).sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
