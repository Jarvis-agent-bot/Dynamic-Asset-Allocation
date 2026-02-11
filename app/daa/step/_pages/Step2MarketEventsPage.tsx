"use client";

import { useEffect, useMemo, useState } from "react";

import { filterMarketEvents, type MarketEvent, type MarketEventSource } from "../../../../src/core/marketEvents";
import {
  mergeMarketEvents,
  normalizeTwitterInput,
  normalizeXueqiuNewsInput,
  normalizeYahooFinanceNewsInput,
} from "../../../../src/market/normalize";

import { LS_MARKET_EVENTS, pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";

function fmtTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || "");
  return d.toLocaleString("zh-CN", { hour12: false });
}

const SAMPLE_TWITTER_JSON = pretty([
  {
    id: "1870000000000000000",
    created_at: "2026-02-10T08:30:00.000Z",
    text: "Macro: CPI print looks softer than expected. $SPY $QQQ\nAnalyst view: risk-on may persist.",
    author: "@analyst_list",
    url: "https://twitter.com/",
    tags: ["macro", "rates"],
  },
]);

const SAMPLE_YFINANCE_JSON = pretty([
  {
    uuid: "yf-1",
    title: "Company earnings beat estimates",
    link: "https://finance.yahoo.com/",
    providerPublishTime: 1765414200,
    relatedTickers: ["AAPL"],
    summary: "Objective news example from yfinance export.",
  },
]);

const SAMPLE_XUEQIU_JSON = pretty({
  items: [
    {
      id: "xq-1",
      created_at: 1765417800,
      title: "雪球：市场快讯",
      summary: "示例：可粘贴雪球 API/抓取导出的 JSON。",
      symbols: ["SH600519"],
      url: "https://xueqiu.com/",
    },
  ],
});

const DEFAULT_EVENTS: MarketEvent[] = [
  {
    id: "tw-sample",
    source: "twitter",
    ts: "2026-02-06T08:30:00.000Z",
    title: "Macro: CPI print looks softer than expected",
    summary: "Analyst view: risk-on may persist if follow-through continues.",
    symbols: ["SPY", "QQQ"],
    author: "@analyst_list",
    tags: ["macro", "rates"],
    url: "https://twitter.com",
  },
  {
    id: "news-sample",
    source: "news",
    ts: "2026-02-06T06:10:00.000Z",
    title: "Company earnings beat estimates",
    summary: "Objective news stub. Later: yfinance/xueqiu ingestion.",
    symbols: ["AAPL"],
    tags: ["earnings"],
    url: "https://finance.yahoo.com",
  },
];

export default function Step2MarketEventsPage() {
  const [events, setEvents] = useState<MarketEvent[]>(DEFAULT_EVENTS);
  const [selected, setSelected] = useState<MarketEvent | null>(null);

  const [showTwitter, setShowTwitter] = useState(true);
  const [showNews, setShowNews] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [since, setSince] = useState(""); // YYYY-MM-DD
  const [until, setUntil] = useState(""); // YYYY-MM-DD

  const [twitterText, setTwitterText] = useState("");
  const [yfinanceText, setYfinanceText] = useState("");
  const [xueqiuText, setXueqiuText] = useState("");
  const [ingestIssues, setIngestIssues] = useState<string[]>([]);
  const [copyState, setCopyState] = useState<string>("");

  const [twitterListId, setTwitterListId] = useState("1898757620019908725");
  const [twitterListLimit, setTwitterListLimit] = useState(50);
  const [twitterCommunityId, setTwitterCommunityId] = useState("");
  const [twitterCommunityCursor, setTwitterCommunityCursor] = useState("");
  const [twitterCommunityLimit, setTwitterCommunityLimit] = useState(50);

  const [yahooSymbol, setYahooSymbol] = useState("AAPL");
  const [xueqiuSymbol, setXueqiuSymbol] = useState("SH603533");
  const [fetchState, setFetchState] = useState<string>("");

  useEffect(() => {
    const stored = readJsonFromLs<MarketEvent[]>(LS_MARKET_EVENTS);
    if (stored && Array.isArray(stored) && stored.length) {
      setEvents(stored);
    }
  }, []);

  useEffect(() => {
    saveJsonToLs(LS_MARKET_EVENTS, events);
  }, [events]);

  const filtered = useMemo(() => {
    const sources: MarketEventSource[] = [];
    if (showTwitter) sources.push("twitter");
    if (showNews) sources.push("news");

    const sinceTs = since ? `${since}T00:00:00.000Z` : undefined;
    const untilTs = until ? `${until}T23:59:59.999Z` : undefined;

    return filterMarketEvents(events, {
      sources,
      symbols: symbol.trim() ? [symbol.trim()] : undefined,
      sinceTs,
      untilTs,
      limit: 500,
    });
  }, [events, showTwitter, showNews, symbol, since, until]);

  function ingest() {
    const issues: string[] = [];
    const added: MarketEvent[] = [];

    if (twitterText.trim()) {
      const r = normalizeTwitterInput(twitterText, {});
      issues.push(...r.issues.map((x) => `twitter: ${x}`));
      added.push(...r.events);
    }

    if (yfinanceText.trim()) {
      const r = normalizeYahooFinanceNewsInput(yfinanceText);
      issues.push(...r.issues.map((x) => `yfinance: ${x}`));
      added.push(...r.events);
    }

    if (xueqiuText.trim()) {
      const r = normalizeXueqiuNewsInput(xueqiuText);
      issues.push(...r.issues.map((x) => `xueqiu: ${x}`));
      added.push(...r.events);
    }

    if (!added.length) {
      issues.push("no events produced (check your JSON/text)");
      setIngestIssues(issues);
      return;
    }

    setEvents((prev) => mergeMarketEvents(prev, added));
    setIngestIssues(issues);
  }

  function safeParseJsonArray(text: string): any[] {
    try {
      const v = JSON.parse(text);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function mergeLooseTweetItems(prev: any[], added: any[]): any[] {
    const out: any[] = [];
    const seen = new Set<string>();

    const push = (it: any) => {
      const id = String(it?.id ?? "").trim();
      const createdAt = String(it?.created_at ?? it?.createdAt ?? "").trim();
      const text = String(it?.text ?? it?.full_text ?? it?.content ?? "").trim();
      const key = id || (createdAt && text ? `${createdAt}::${text}` : text);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(it);
    };

    prev.forEach(push);
    added.forEach(push);
    return out;
  }

  function extractCursor(payload: any): string {
    const c =
      payload?.nextCursor ??
      payload?.next_cursor ??
      payload?.cursor ??
      payload?.next?.cursor ??
      payload?.data?.next_cursor ??
      payload?.data?.cursor;
    return typeof c === "string" ? c : "";
  }

  async function fetchTwitterList() {
    setFetchState("fetching twitter list...");
    try {
      const qs = new URLSearchParams();
      qs.set("listId", twitterListId);
      if (Number.isFinite(twitterListLimit) && twitterListLimit > 0) qs.set("limit", String(Math.min(200, Math.trunc(twitterListLimit))));

      const r = await fetch(`/api/daa/market/twitter/list?${qs.toString()}`, { cache: "no-store" });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j?.error || `http ${r.status}`);

      // Convert upstream payload into an array so our normalizer can ingest it.
      const payload = j?.payload;
      const items: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data) ? payload.data : [];
      const normalized = items.map((it) => {
        const id = String(it?.restId ?? it?.id ?? it?.tweet_id ?? "");
        const createdAt = String(it?.created_at ?? it?.createdAt ?? it?.time ?? it?.ts ?? "");
        const text = String(it?.text ?? it?.full_text ?? it?.content ?? it?.message ?? "");
        const author = String(it?.author ?? it?.user ?? it?.screen_name ?? it?.screenName ?? it?.username ?? "");
        const url = String(it?.url ?? "");
        return { id: id || undefined, created_at: createdAt || undefined, text, author: author || undefined, url: url || undefined };
      });

      setTwitterText((prev) => {
        const prevArr = safeParseJsonArray(prev);
        const merged = mergeLooseTweetItems(prevArr, normalized);
        return pretty(merged);
      });

      setFetchState(`twitter list fetched: ${normalized.length} (merged)`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter list fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchTwitterCommunity(opts?: { reset?: boolean }) {
    const reset = Boolean(opts?.reset);
    const communityId = twitterCommunityId.trim();
    if (!communityId) {
      setFetchState("twitter community fetch failed: missing communityId");
      return;
    }

    const cursor = reset ? "" : twitterCommunityCursor.trim();
    setFetchState(reset ? "fetching twitter community (first page)..." : "fetching twitter community (next page)...");

    try {
      const qs = new URLSearchParams();
      qs.set("communityId", communityId);
      if (cursor) qs.set("cursor", cursor);
      if (Number.isFinite(twitterCommunityLimit) && twitterCommunityLimit > 0) qs.set("limit", String(Math.min(200, Math.trunc(twitterCommunityLimit))));

      const r = await fetch(`/api/daa/market/twitter/community?${qs.toString()}`, { cache: "no-store" });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j?.error || `http ${r.status}`);

      const payload = j?.payload;
      const nextCursor = extractCursor(payload);
      if (nextCursor) setTwitterCommunityCursor(nextCursor);

      const items: any[] =
        Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.tweets) ? payload.tweets : [];

      const normalized = items.map((it) => {
        const id = String(it?.restId ?? it?.id ?? it?.tweet_id ?? "");
        const createdAt = String(it?.created_at ?? it?.createdAt ?? it?.time ?? it?.ts ?? "");
        const text = String(it?.text ?? it?.full_text ?? it?.content ?? it?.message ?? "");
        const author = String(it?.author ?? it?.user ?? it?.screen_name ?? it?.screenName ?? it?.username ?? "");
        const url = String(it?.url ?? "");
        return { id: id || undefined, created_at: createdAt || undefined, text, author: author || undefined, url: url || undefined };
      });

      setTwitterText((prev) => {
        const prevArr = safeParseJsonArray(prev);
        const merged = mergeLooseTweetItems(reset ? [] : prevArr, normalized);
        return pretty(merged);
      });

      setFetchState(`twitter community fetched: ${normalized.length}${nextCursor ? " (cursor updated)" : ""}`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter community fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchYahooRss() {
    setFetchState("fetching yahoo rss...");
    try {
      const r = await fetch(`/api/daa/market/yahoo/rss?symbol=${encodeURIComponent(yahooSymbol)}`, { cache: "no-store" });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j?.error || `http ${r.status}`);

      // Normalize into a yfinance-like array.
      const arr = (j?.items ?? []).map((it: any, idx: number) => {
        return {
          uuid: `yahoo-rss-${j?.symbol ?? yahooSymbol}-${idx}`,
          title: it?.title,
          link: it?.link,
          providerPublishTime: it?.pubDate,
          relatedTickers: [String(j?.symbol ?? yahooSymbol).toUpperCase()],
          summary: it?.summary,
        };
      });

      setYfinanceText(pretty(arr));
      setFetchState(`yahoo rss fetched: ${arr.length}`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`yahoo rss fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchXueqiuQuote() {
    setFetchState("fetching xueqiu quote...");
    try {
      const r = await fetch(`/api/daa/market/xueqiu/quotec?symbol=${encodeURIComponent(xueqiuSymbol)}`, { cache: "no-store" });
      const j = (await r.json()) as any;
      if (!r.ok) throw new Error(j?.error || `http ${r.status}`);

      // Wrap it into a news-like shape so it can be ingested into MarketEvent[]
      const quote = j?.payload?.data?.[0] ?? j?.payload?.data?.quote ?? j?.payload?.data ?? j?.payload;
      const now = new Date().toISOString();
      const wrapped = {
        items: [
          {
            id: `xq-quote-${xueqiuSymbol}-${Date.now()}`,
            created_at: now,
            title: `雪球行情 ${xueqiuSymbol}`,
            summary: JSON.stringify(quote)?.slice(0, 800) ?? "",
            symbols: [xueqiuSymbol],
            url: `https://xueqiu.com/S/${xueqiuSymbol}`,
            quote,
          },
        ],
      };

      setXueqiuText(pretty(wrapped));
      setFetchState("xueqiu quote fetched: 1");
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`xueqiu quote fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function copyAllJson() {
    const payload = {
      generatedAt: new Date().toISOString(),
      events: filtered,
    };

    navigator.clipboard.writeText(pretty(payload));
    setCopyState(`copied ${filtered.length} events`);
    window.setTimeout(() => setCopyState(""), 1200);
  }

  function copyTwitterJson() {
    const arr = safeParseJsonArray(twitterText);
    const text = arr.length ? pretty(arr) : twitterText;

    navigator.clipboard.writeText(text);
    setCopyState(arr.length ? `copied twitter json (${arr.length} items)` : "copied twitter text");
    window.setTimeout(() => setCopyState(""), 1200);
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 2 — 市场信息</h1>
      <p style={{ color: "#444" }}>
        v0：支持把 Twitter（主观）与 yfinance/雪球（客观新闻）标准化为统一 <code>MarketEvent</code> JSON，并在页面里过滤/查看/复制。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>Ingest / Fetch（自动拉取 → 标准化 → 合并到事件列表）</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={ingest} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              Ingest
            </button>
            <button
              onClick={() => {
                setTwitterText(SAMPLE_TWITTER_JSON);
                setYfinanceText(SAMPLE_YFINANCE_JSON);
                setXueqiuText(SAMPLE_XUEQIU_JSON);
                setIngestIssues([]);
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Load samples
            </button>
            <button
              onClick={() => {
                setTwitterText("");
                setYfinanceText("");
                setXueqiuText("");
                setIngestIssues([]);
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10, borderBottom: "1px solid #eee" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#666" }}>
              自动拉取（token 仅在服务端 env）：<code>TWITTERDATA_TOKEN</code> / <code>XUEQIU_TOKEN</code>
            </div>
            {fetchState ? <span style={{ fontSize: 12, color: "#666" }}>{fetchState}</span> : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterListId} onChange={(e) => setTwitterListId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Twitter listId" />
            <input
              type="number"
              value={twitterListLimit}
              onChange={(e) => setTwitterListLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }}
              placeholder="limit"
              min={1}
              max={200}
            />
            <button onClick={fetchTwitterList} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch List
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterCommunityId} onChange={(e) => setTwitterCommunityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Twitter communityId" />
            <button onClick={() => fetchTwitterCommunity({ reset: true })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch Community
            </button>
            <button
              onClick={() => fetchTwitterCommunity({ reset: false })}
              disabled={!twitterCommunityCursor.trim()}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", opacity: twitterCommunityCursor.trim() ? 1 : 0.5 }}
              title={twitterCommunityCursor.trim() ? "" : "No cursor yet (fetch first page)"}
            >
              Next page
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterCommunityCursor} onChange={(e) => setTwitterCommunityCursor(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Community cursor (auto-filled)" />
            <input
              type="number"
              value={twitterCommunityLimit}
              onChange={(e) => setTwitterCommunityLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }}
              placeholder="limit"
              min={1}
              max={200}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={yahooSymbol} onChange={(e) => setYahooSymbol(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Yahoo symbol (AAPL)" />
            <button onClick={fetchYahooRss} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch Yahoo RSS
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={xueqiuSymbol} onChange={(e) => setXueqiuSymbol(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Xueqiu symbol (SH603533)" />
            <button onClick={fetchXueqiuQuote} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch Xueqiu Quote
            </button>
          </div>
        </div>

        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#666" }}>Twitter（主观）— 支持 JSON array 或纯文本（每行一条）</label>
              <button
                onClick={copyTwitterJson}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
                title="Copy the current Twitter textarea content (prefer JSON array)"
              >
                Copy Twitter JSON
              </button>
            </div>
            <textarea
              value={twitterText}
              onChange={(e) => setTwitterText(e.target.value)}
              placeholder="Paste Twitter list export JSON or plaintext..."
              style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>yfinance（客观）— 建议粘贴 Python 导出的 <code>list[dict]</code></label>
            <textarea
              value={yfinanceText}
              onChange={(e) => setYfinanceText(e.target.value)}
              placeholder="Paste yfinance news JSON..."
              style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>雪球（客观）— 支持 <code>{"{items: [...] }"}</code> / <code>{"{list: [...] }"}</code> / array</label>
            <textarea
              value={xueqiuText}
              onChange={(e) => setXueqiuText(e.target.value)}
              placeholder="Paste xueqiu news JSON..."
              style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
            />
          </div>

          {ingestIssues.length ? (
            <div style={{ padding: 10, borderRadius: 10, border: "1px solid #fee2e2", background: "#fff1f2", color: "#991b1b", fontSize: 12 }}>
              {ingestIssues.map((x, i) => (
                <div key={i}>{x}</div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showTwitter} onChange={(e) => setShowTwitter(e.target.checked)} />
          <span>Twitter（主观）</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showNews} onChange={(e) => setShowNews(e.target.checked)} />
          <span>News（客观）</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Symbol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="SPY"
            aria-label="Filter by symbol"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        {symbol.trim() ? (
          <button
            onClick={() => setSymbol("")}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
          >
            Clear
          </button>
        ) : null}

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Since</span>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            aria-label="Filter since date"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Until</span>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-label="Filter until date"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        {(since || until) ? (
          <button
            onClick={() => {
              setSince("");
              setUntil("");
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
          >
            Clear dates
          </button>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#666" }}>{filtered.length} events</div>
          <button onClick={copyAllJson} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
            Copy events JSON
          </button>
          {copyState ? <div style={{ fontSize: 12, color: "#16a34a" }}>{copyState}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>Events</div>
            <button
              onClick={() => {
                setEvents([]);
                setSelected(null);
              }}
              style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
            >
              Reset
            </button>
          </div>
          <div style={{ padding: 10 }}>
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #eee",
                  background: selected?.id === e.id ? "#f4f7ff" : "#fff",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{e.source}</div>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{e.summary || ""}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#777",
                    marginTop: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    {(e.symbols || []).join(", ")}
                    {e.author ? <span style={{ marginLeft: 8, color: "#666" }}>{e.author}</span> : null}
                    {e.tags?.length ? <span style={{ marginLeft: 8, color: "#666" }}>{e.tags.join(" · ")}</span> : null}
                  </div>
                  <div>{fmtTs(e.ts)}</div>
                </div>
              </button>
            ))}

            {filtered.length === 0 ? <div style={{ color: "#666" }}>No events.</div> : null}
          </div>
        </section>

        {selected ? (
          <section style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                padding: 10,
                borderBottom: "1px solid #eee",
                background: "#fafafa",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>Detail</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{selected.title}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {selected.url ? (
                  <a href={selected.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                    Open
                  </a>
                ) : null}
                <button
                  onClick={() => navigator.clipboard.writeText(pretty(selected))}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
                >
                  Copy JSON
                </button>
                <button
                  onClick={() => setSelected(null)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ padding: 10 }}>
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(selected)}</pre>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
