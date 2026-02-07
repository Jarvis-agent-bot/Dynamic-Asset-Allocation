"use client";

import { useMemo, useState } from "react";

import { ensembleSignals } from "../../../../src/core/signals";
import { buyAndHold, smaCrossover } from "../../../../src/core/strategies";
import { DEFAULT_ENSEMBLE_WEIGHTS } from "../../../../src/core/config";

function pretty(x) {
  return JSON.stringify(x, null, 2);
}

function makeMockSeries({ n = 60, start = 100, daily = 0.002 } = {}) {
  const out = [];
  let v = start;
  const startDate = new Date("2026-02-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, close: v });
    v = v * (1 + daily);
  }
  return out;
}

/**
 * Step4 v0 — 基准再平衡（Baseline Rebalance）
 *
 * Spec: docs/DAA_STEP4_BASELINE_REBALANCE_V0.md
 */
export default function Step4BaselineRebalancePage() {
  const [symbol, setSymbol] = useState("SPY");
  const [priceSeriesText, setPriceSeriesText] = useState(pretty(makeMockSeries({ n: 60, daily: 0.001 })));

  const { signals, error } = useMemo(() => {
    let series;
    try {
      series = JSON.parse(priceSeriesText);
    } catch {
      return { signals: null, error: "priceSeries JSON parse failed" };
    }

    try {
      // v0: keep strategies/weights fixed; this page is just a runnable loop.
      const strategies = [buyAndHold(), smaCrossover({ fast: 3, slow: 10 })];
      const sigs = ensembleSignals(strategies, series, DEFAULT_ENSEMBLE_WEIGHTS);
      return { signals: sigs, error: null };
    } catch (e) {
      return { signals: null, error: String(e?.message || e) };
    }
  }, [priceSeriesText]);

  const canCopy = !!signals && Array.isArray(signals) && signals.length > 0 && !error;

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准再平衡（Baseline Rebalance）v0</h1>
      <p style={{ color: "#444" }}>v0：输入价格序列 → core signals 输出；不做推荐、不做自动下单。</p>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Symbol</div>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="SPY"
          style={{
            width: 220,
            padding: "8px 10px",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontFamily: "ui-monospace, SFMono-Regular",
          }}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>v0 暂不使用 symbol 参与计算（为后续接入预留）。</div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Price series (JSON)</div>
            <button
              onClick={() => setPriceSeriesText(pretty(makeMockSeries({ n: 60, daily: 0.001 })))}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Reset mock
            </button>
          </div>
          <textarea
            value={priceSeriesText}
            onChange={(e) => setPriceSeriesText(e.target.value)}
            rows={18}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 6,
              fontFamily: "ui-monospace, SFMono-Regular",
            }}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>数组元素：{"{ date: \"YYYY-MM-DD\", close: number }"}</div>
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Signals 输出</div>
            <button
              disabled={!canCopy}
              onClick={() => navigator.clipboard.writeText(pretty(signals))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                opacity: canCopy ? 1 : 0.5,
              }}
            >
              Copy
            </button>
          </div>

          {error ? (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", color: "#b00020" }}>{error}</pre>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(signals || [])}</pre>
          )}
        </section>
      </div>
    </main>
  );
}
