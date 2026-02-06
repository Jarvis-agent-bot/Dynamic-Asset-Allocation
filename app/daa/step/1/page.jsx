"use client";

import { useMemo, useState } from "react";

import { buyAndHold, smaCrossover } from "../../../../src/core/strategies";
import { backtestSingleAsset, rankBacktestResults } from "../../../../src/core/backtest";

function jsonPretty(x) {
  return JSON.stringify(x, null, 2);
}

export default function Step1BacktestPage() {
  const [symbol, setSymbol] = useState("SPY");
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-02-01");
  const [runError, setRunError] = useState(null);
  const [result, setResult] = useState(null);

  // v0: mock price series (flat-ish). We keep this explicit so the UI can ship
  // before market-data ingestion exists.
  const series = useMemo(() => {
    const out = [];
    const n = 30;
    for (let i = 0; i < n; i++) {
      out.push({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close: 100 + (i % 3) * 0.2 });
    }
    return out;
  }, [symbol, start, end]);

  const strategies = useMemo(() => {
    return [buyAndHold(), smaCrossover({ fast: 3, slow: 10 })];
  }, []);

  function run() {
    setRunError(null);
    try {
      const results = strategies.map((s) => backtestSingleAsset(s, series));
      const ranked = rankBacktestResults(results);
      setResult({
        input: { symbol, start, end, strategies: strategies.map((s) => ({ id: s.id, name: s.name })) },
        ranked,
      });
    } catch (e) {
      setRunError(e?.message || String(e));
      setResult(null);
    }
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 1 — 回测算法组合</h1>
      <p style={{ color: "#444" }}>
        v0：先用 mock 价格序列把页面交互、结果结构、可复制 JSON 做出来；后续再接入市场数据（Twitter/雪球/yfinance）。
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#666" }}>Symbol</span>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#666" }}>Start</span>
          <input value={start} onChange={(e) => setStart(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#666" }}>End</span>
          <input value={end} onChange={(e) => setEnd(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
        </label>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={run} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}>
          Run
        </button>
        {runError ? <span style={{ color: "#b00020", fontSize: 12 }}>Error: {runError}</span> : null}
      </div>

      {result ? (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Ranked results</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {result.ranked.map((r) => (
                <li key={r.strategyId} style={{ margin: "8px 0" }}>
                  <div style={{ fontWeight: 600 }}>{r.strategyName}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    score={r.score.toFixed(4)} | totalReturn={(r.metrics.totalReturn * 100).toFixed(2)}% | mdd={(r.metrics.maxDrawdown * 100).toFixed(2)}% | sharpe={r.metrics.sharpe.toFixed(2)}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>JSON</div>
              <button
                onClick={() => navigator.clipboard.writeText(jsonPretty(result))}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
              >
                Copy
              </button>
            </div>
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{jsonPretty(result)}</pre>
          </section>
        </div>
      ) : null}
    </main>
  );
}
