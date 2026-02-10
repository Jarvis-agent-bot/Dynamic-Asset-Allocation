"use client";

import { useMemo, useState } from "react";

import type { PriceBar, SignalThresholds } from "@/src/core/domain";
import { DEFAULT_ENSEMBLE_WEIGHTS } from "@/src/core/config";
import { DEFAULT_SIGNAL_THRESHOLDS, ensembleSignals } from "@/src/core/signals";
import { buyAndHold, smaCrossover } from "@/src/core/strategies";

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "JSON parse failed" };
  }
}

function makeMockSeries(): PriceBar[] {
  // Small, deterministic series: enough bars to make SMA(5/20) meaningful.
  const out: PriceBar[] = [];
  const start = new Date("2026-01-01T00:00:00Z");
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const close = 100 + i * 0.2 + (i % 7 === 0 ? -0.8 : 0); // gentle trend with tiny bumps
    out.push({ date, close: Number(close.toFixed(4)) });
  }
  return out;
}

/**
 * Step4 v0 — 基准再平衡（signals 输出）
 *
 * v0 goal: from price series input, run core `ensembleSignals(...)` and output `signals: Signal[]`
 * for Step5 “信号决策摘要”. No real data source, no trading execution.
 */
export default function Step4BaselineRebalancePage() {
  const defaultSeries = useMemo(() => makeMockSeries(), []);

  const [seriesText, setSeriesText] = useState(() => pretty(defaultSeries));
  const [weightsText, setWeightsText] = useState(() => pretty(DEFAULT_ENSEMBLE_WEIGHTS));
  const [thresholdsText, setThresholdsText] = useState(() => pretty(DEFAULT_SIGNAL_THRESHOLDS));
  const [copyState, setCopyState] = useState("");

  const { ok, error, signalsJson, latestSignal } = useMemo(() => {
    const parsedSeries = safeJsonParse(seriesText);
    if (!parsedSeries.ok) return { ok: false, error: `series: ${parsedSeries.error}`, signalsJson: "", latestSignal: null };

    const parsedWeights = safeJsonParse(weightsText);
    if (!parsedWeights.ok) return { ok: false, error: `weightsConfig: ${parsedWeights.error}`, signalsJson: "", latestSignal: null };

    const parsedThresholds = safeJsonParse(thresholdsText);
    if (!parsedThresholds.ok) return { ok: false, error: `thresholds: ${parsedThresholds.error}`, signalsJson: "", latestSignal: null };

    try {
      const series = parsedSeries.value as PriceBar[];
      const weightsConfig = (parsedWeights.value ?? {}) as Record<string, number>;
      const thresholds = (parsedThresholds.value ?? {}) as SignalThresholds;

      const strategies = [buyAndHold(), smaCrossover({ fast: 5, slow: 20 })];
      const sigs = ensembleSignals(strategies, series, weightsConfig, thresholds);

      return {
        ok: true,
        error: null,
        signalsJson: pretty(sigs),
        latestSignal: sigs.at(-1) ?? null,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        signalsJson: "",
        latestSignal: null,
      };
    }
  }, [seriesText, thresholdsText, weightsText]);

  async function copyToClipboard(text: string) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyState("Copied");
      window.setTimeout(() => setCopyState(""), 1200);
    } catch {
      setCopyState("Copy failed");
      window.setTimeout(() => setCopyState(""), 2000);
    }
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准再平衡（signals 输出）v0</h1>
      <p style={{ color: "#444" }}>
        v0：输入 <code>PriceBar[]</code> + <code>weightsConfig</code> + <code>thresholds</code>，运行 core 的 <code>ensembleSignals(...)</code> 生成 <code>signals: Signal[]</code>。
        不接真实数据源、不做交易执行。
      </p>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Inputs</h2>
          <div style={{ fontSize: 12, color: ok ? "#2e7d32" : "#b00020" }}>{ok ? "OK" : "ERROR"}</div>
        </div>

        {!ok ? <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Price series (PriceBar[] JSON)</div>
              <button
                onClick={() => setSeriesText(pretty(defaultSeries))}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
              >
                Reset mock
              </button>
            </div>
            <textarea
              value={seriesText}
              onChange={(e) => setSeriesText(e.target.value)}
              rows={14}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontFamily: "ui-monospace, SFMono-Regular",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>weightsConfig (Record&lt;string, number&gt; JSON)</div>
            <textarea
              value={weightsText}
              onChange={(e) => setWeightsText(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontFamily: "ui-monospace, SFMono-Regular",
              }}
            />

            <div style={{ fontSize: 12, fontWeight: 600, margin: "10px 0 6px" }}>thresholds (SignalThresholds JSON)</div>
            <textarea
              value={thresholdsText}
              onChange={(e) => setThresholdsText(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontFamily: "ui-monospace, SFMono-Regular",
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Signals output</h2>
          <button
            disabled={!ok || !signalsJson}
            onClick={() => copyToClipboard(signalsJson)}
            style={{
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              opacity: ok && signalsJson ? 1 : 0.5,
              fontSize: 12,
            }}
          >
            Copy {copyState ? `(${copyState})` : ""}
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Last signal (today)</div>
            <pre style={{ margin: 0, padding: 10, borderRadius: 6, background: "#fafafa", border: "1px solid #eee", overflowX: "auto" }}>
              {latestSignal ? pretty(latestSignal) : "(none)"}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>signals: Signal[] JSON</div>
            <pre style={{ margin: 0, padding: 10, borderRadius: 6, background: "#fafafa", border: "1px solid #eee", overflowX: "auto", maxHeight: 340 }}>
              {signalsJson || "(error)"}
            </pre>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Fixed strategies (v0)</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>buy_and_hold</li>
          <li>sma_5_20 (smaCrossover fast=5 slow=20)</li>
        </ul>
      </section>
    </main>
  );
}
