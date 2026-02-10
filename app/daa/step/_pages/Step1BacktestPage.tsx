"use client";

import { useMemo, useState } from "react";

import { buyAndHold, smaCrossover } from "../../../../src/core/strategies";
import { backtestSingleAsset, rankBacktestResults, type RankedBacktestResult } from "../../../../src/core/backtest";

type Step1Result = {
  ranked: RankedBacktestResult[];
  input: unknown;
  output?: unknown;
} & Record<string, unknown>;

function jsonPretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

export default function Step1BacktestPage() {
  const [symbol, setSymbol] = useState("SPY");
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-02-01");
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<Step1Result | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const validationError = useMemo(() => {
    if (!symbol.trim()) return "Symbol is required";
    if (!start) return "Start date is required";
    if (!end) return "End date is required";
    if (end < start) return "End date must be on/after Start date";
    return null;
  }, [symbol, start, end]);

  // v0: mock price series (flat-ish). We keep this explicit so the UI can ship
  // before market-data ingestion exists.
  // Small quality-of-life: the mock series now respects the user-selected date range.
  const series = useMemo(() => {
    function parseISODate(iso: string) {
      // Expect YYYY-MM-DD. Use UTC to avoid timezone drift.
      const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(iso || ""));
      if (!m) return null;
      const d = new Date(`${iso}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    function fmt(d: Date) {
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${da}`;
    }

    function addDays(d: Date, n: number) {
      const x = new Date(d.getTime());
      x.setUTCDate(x.getUTCDate() + n);
      return x;
    }

    const s = parseISODate(start);
    const e = parseISODate(end);
    if (!s || !e || e < s) return [];

    // Cap to keep UI snappy if someone picks huge ranges in v0.
    const maxDays = 200;
    const out = [];

    // Tiny deterministic jitter based on symbol so users feel inputs “do something”.
    const seed = String(symbol || "").toUpperCase();
    const base = 100 + (seed.length % 7) * 0.5;

    for (let i = 0; i <= maxDays; i++) {
      const d = addDays(s, i);
      if (d > e) break;
      const wobble = (i % 5) * 0.12;
      out.push({ date: fmt(d), close: base + i * 0.03 + wobble });
    }
    return out;
  }, [symbol, start, end]);

  const strategies = useMemo(() => {
    return [buyAndHold(), smaCrossover({ fast: 3, slow: 10 })];
  }, []);

  function run() {
    setRunError(null);
    if (validationError) {
      setRunError(validationError);
      setResult(null);
      return;
    }
    if (!series.length) {
      setRunError("No price data (mock series empty for this date range)");
      setResult(null);
      return;
    }
    try {
      const results = strategies.map((s) => backtestSingleAsset(s, series));
      const ranked = rankBacktestResults(results);
      setResult({
        input: { symbol, start, end, strategies: strategies.map((s) => ({ id: s.id, name: s.name })) },
        ranked,
      });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 1 — 回测算法组合</h1>
      <p style={{ color: "#444" }}>
        v0：先用 mock 价格序列把页面交互、结果结构、可复制 JSON 做出来；后续再接入市场数据（Twitter/雪球/yfinance）。
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. SPY"
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Start</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>End</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </label>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="submit"
            disabled={Boolean(validationError)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #111",
              background: validationError ? "#666" : "#111",
              color: "#fff",
              cursor: validationError ? "not-allowed" : "pointer",
              opacity: validationError ? 0.7 : 1,
            }}
          >
            Run
          </button>
          {validationError ? <span style={{ color: "#b00020", fontSize: 12 }}>{validationError}</span> : null}
          {!validationError && runError ? <span style={{ color: "#b00020", fontSize: 12 }}>Error: {runError}</span> : null}
        </div>
      </form>

      <div style={{ marginTop: 10, fontSize: 12, color: series.length ? "#555" : "#b00020" }} aria-live="polite">
        Mock series: {series.length} points (capped at 200 days) — {start} → {end}
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
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(jsonPretty(result));
                    setCopyStatus("copied");
                    setTimeout(() => setCopyStatus("idle"), 1200);
                  } catch {
                    setCopyStatus("failed");
                    setTimeout(() => setCopyStatus("idle"), 1500);
                  }
                }}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
              >
                {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}
              </button>
            </div>
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{jsonPretty(result)}</pre>
          </section>
        </div>
      ) : null}
    </main>
  );
}
