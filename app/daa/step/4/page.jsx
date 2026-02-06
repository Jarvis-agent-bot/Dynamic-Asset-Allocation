"use client";

import { useMemo, useState } from "react";

import { ensembleSignals } from "../../../../src/core/signals";

function pretty(x) {
  return JSON.stringify(x, null, 2);
}

// v0: baseline rebalance uses existing signals output + simple position sizing placeholders.
export default function Step4BaselineRebalancePage() {
  const [symbol, setSymbol] = useState("SPY");
  const [priceSeriesText, setPriceSeriesText] = useState(
    pretty([
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 102 },
      { date: "2026-01-03", close: 101 },
      { date: "2026-01-04", close: 103 },
      { date: "2026-01-05", close: 105 },
    ])
  );

  const { signals, error } = useMemo(() => {
    let series;
    try {
      series = JSON.parse(priceSeriesText);
    } catch (e) {
      return { signals: null, error: "priceSeries JSON parse failed" };
    }

    try {
      const out = ensembleSignals({
        symbol,
        series,
      });
      return { signals: out, error: null };
    } catch (e) {
      return { signals: null, error: e?.message || String(e) };
    }
  }, [symbol, priceSeriesText]);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准再平衡（v0 占位）</h1>
      <p style={{ color: "#444" }}>
        v0：先把“从信号 → 基准动作建议”的 UI 框架搭起来。暂不实现真实推荐与资金管理联动。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 12, alignItems: "center" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Symbol</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
          <div style={{ fontSize: 12, color: "#666" }}>
            输入一段 price series（date/close），页面会调用 core 的 ensembleSignals 输出 BUY/SELL/HOLD（仅用于框架展示）。
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Price series (JSON)</div>
          <textarea
            value={priceSeriesText}
            onChange={(e) => setPriceSeriesText(e.target.value)}
            rows={10}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 6, fontFamily: "ui-monospace, SFMono-Regular" }}
          />
        </div>
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>Signals</div>
          <button
            onClick={() => navigator.clipboard.writeText(pretty(signals))}
            disabled={!signals}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            Copy
          </button>
        </div>
        {error ? (
          <div style={{ fontSize: 12, color: "#b00020" }}>{error}</div>
        ) : (
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{signals ? pretty(signals) : "(no output)"}</pre>
        )}
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>下一步（非本 PR）</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#444" }}>
          <li>接入 Step3 money plan（constraints + allocations）用于 position sizing。</li>
          <li>把 Market events（Step2）作为“风险提醒/情绪输入”展示。</li>
          <li>再平衡输出变为“建议交易列表”（仍然不执行）。</li>
        </ul>
      </section>
    </main>
  );
}
