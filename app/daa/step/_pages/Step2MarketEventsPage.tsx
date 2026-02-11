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

  function copyAllJson() {
    const payload = {
      generatedAt: new Date().toISOString(),
      events: filtered,
    };

    navigator.clipboard.writeText(pretty(payload));
    setCopyState(`copied ${filtered.length} events`);
    window.setTimeout(() => setCopyState(""), 1200);
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 2 — 市场信息</h1>
      <p style={{ color: "#444" }}>
        v0：支持把 Twitter（主观）与 yfinance/雪球（客观新闻）标准化为统一 <code>MarketEvent</code> JSON，并在页面里过滤/查看/复制。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>Ingest（粘贴 → 标准化 → 合并到事件列表）</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>Twitter（主观）— 支持 JSON array 或纯文本（每行一条）</label>
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
