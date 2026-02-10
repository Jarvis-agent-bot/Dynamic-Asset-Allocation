"use client";

import { useMemo, useState } from "react";

import { filterMarketEvents, type MarketEvent, type MarketEventSource } from "../../../../src/core/marketEvents";

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function fmtTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || "");
  return d.toLocaleString("zh-CN", { hour12: false });
}

const MOCK_EVENTS: MarketEvent[] = [
  {
    id: "tw-1",
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
    id: "news-1",
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
  const [showTwitter, setShowTwitter] = useState(true);
  const [showNews, setShowNews] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [since, setSince] = useState(""); // YYYY-MM-DD
  const [until, setUntil] = useState(""); // YYYY-MM-DD
  const [selected, setSelected] = useState<MarketEvent | null>(null);

  const filtered = useMemo(() => {
    const sources: MarketEventSource[] = [];
    if (showTwitter) sources.push("twitter");
    if (showNews) sources.push("news");

    const sinceTs = since ? `${since}T00:00:00.000Z` : undefined;
    const untilTs = until ? `${until}T23:59:59.999Z` : undefined;

    return filterMarketEvents(MOCK_EVENTS, {
      sources,
      symbols: symbol.trim() ? [symbol.trim()] : undefined,
      sinceTs,
      untilTs,
      limit: 200,
    });
  }, [showTwitter, showNews, symbol, since, until]);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 2 — 市场信息</h1>
      <p style={{ color: "#444" }}>
        v0：先用 mock events 把产品页面结构确定下来。Twitter=主观；yfinance/雪球=客观新闻。
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{filtered.length} events</div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600 }}>Events</div>
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
                <div style={{ fontSize: 12, color: "#777", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 12 }}>
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
            <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", display: "flex", justifyContent: "space-between", gap: 12 }}>
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
