"use client";

import { useEffect, useMemo, useState } from "react";

import type { PriceBar, SignalThresholds } from "@/src/core/domain";
import { DEFAULT_ENSEMBLE_WEIGHTS } from "@/src/core/config";
import { DEFAULT_SIGNAL_THRESHOLDS, ensembleSignals } from "@/src/core/signals";
import { buyAndHold, smaCrossover } from "@/src/core/strategies";
import {
  createDeterministicMockPriceSeriesProvider,
  createOkxPublicPriceSeriesProvider,
  createYfinancePublicPriceSeriesProvider,
  fetchValidatedPriceSeriesEnforcingRange,
} from "@/src/core/providers";
import { inferStep1PriceSeriesSource } from "@/src/daa/step1PriceSeriesSource";

type DataSourceChoice = "auto" | "yfinance" | "okx" | "mock";

type ResolvedSource = Exclude<DataSourceChoice, "auto">;

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

function isMockDebugEnabled(): boolean {
  // Client-only page; using window is OK. This avoids accidentally shipping mock as
  // a "real" option in the normal user flow.
  if (typeof window === "undefined") return false;
  const qs = new URLSearchParams(window.location.search);
  return qs.get("debug") === "1" || qs.get("mock") === "1" || qs.get("daaMock") === "1";
}

/**
 * Step4 v0 — 基准再平衡（signals 输出）
 *
 * v0 goal: from price series input, run core `ensembleSignals(...)` and output `signals: Signal[]`
 * for Step5 “信号决策摘要”.
 */
export default function Step4BaselineRebalancePage() {
  const [dataSource, setDataSource] = useState<DataSourceChoice>("auto");
  const [symbol, setSymbol] = useState("SPY");
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-02-01");

  const allowMock = useMemo(() => isMockDebugEnabled(), []);

  // Keep mock available only behind a debug flag. If a user loads a deep link with
  // dataSource=mock but debug is off, fall back to auto.
  useEffect(() => {
    if (!allowMock && dataSource === "mock") setDataSource("auto");
  }, [allowMock, dataSource]);

  const resolvedSource: ResolvedSource = useMemo(() => {
    if (dataSource === "auto") return inferStep1PriceSeriesSource(symbol);
    return dataSource;
  }, [dataSource, symbol]);

  const validationError = useMemo(() => {
    if (!symbol.trim()) return "Symbol is required";
    if (!start) return "Start date is required";
    if (!end) return "End date is required";
    if (end < start) return "End date must be on/after Start date";
    return null;
  }, [symbol, start, end]);

  const [fetchedSeries, setFetchedSeries] = useState<PriceBar[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const [seriesTouched, setSeriesTouched] = useState(false);

  const [seriesText, setSeriesText] = useState(() => pretty([]));
  const [weightsText, setWeightsText] = useState(() => pretty(DEFAULT_ENSEMBLE_WEIGHTS));
  const [thresholdsText, setThresholdsText] = useState(() => pretty(DEFAULT_SIGNAL_THRESHOLDS));
  const [copyState, setCopyState] = useState("");

  // Step4 v0: replace mock series with real price-series fetch (provider selectable).
  // We still keep the JSON editor so we can paste/override series when debugging.
  useEffect(() => {
    let cancelled = false;

    async function runFetch() {
      setIsFetching(true);
      setFetchError(null);

      try {
        const provider =
          resolvedSource === "okx"
            ? createOkxPublicPriceSeriesProvider({ bar: "1D" })
            : resolvedSource === "yfinance"
              ? createYfinancePublicPriceSeriesProvider()
              : createDeterministicMockPriceSeriesProvider({ maxDays: 500 });

        const next = await fetchValidatedPriceSeriesEnforcingRange(provider, {
          symbol: String(symbol || "")
            .trim()
            .toUpperCase(),
          start,
          end,
        });

        if (cancelled) return;

        setFetchedSeries(next);

        // If the user hasn't edited the JSON yet, keep it in sync with the latest fetched series.
        if (!seriesTouched) setSeriesText(pretty(next));
      } catch (e) {
        if (cancelled) return;
        setFetchedSeries([]);
        setFetchError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }

    if (!validationError) {
      void runFetch();
    } else {
      setFetchedSeries([]);
      setFetchError(null);
      setIsFetching(false);
    }

    return () => {
      cancelled = true;
    };
  }, [end, resolvedSource, seriesTouched, start, symbol, validationError]);

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

  const dataChoiceLabel = useMemo(() => {
    if (dataSource !== "auto") return dataSource;
    return `auto → ${resolvedSource}`;
  }, [dataSource, resolvedSource]);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准再平衡（signals 输出）v0</h1>
      <p style={{ color: "#444" }}>
        v0：从真实价格序列获取 <code>PriceBar[]</code>（yfinance / OKX；Mock 仅用于 debug），运行 core 的 <code>ensembleSignals(...)</code> 生成 <code>signals: Signal[]</code>。
        仍保留 JSON editor，方便粘贴/覆盖输入做回归。
      </p>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Market data</h2>
          <div style={{ fontSize: 12, color: validationError || fetchError ? "#b00020" : "#2e7d32" }}>
            {validationError ? "INVALID" : fetchError ? "FETCH ERROR" : isFetching ? "FETCHING" : "OK"}
          </div>
        </div>

        {validationError ? <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>{validationError}</div> : null}
        {!validationError && fetchError ? <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>{fetchError}</div> : null}

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Data</span>
            <select
              value={dataSource}
              onChange={(e) => {
                const v = e.target.value;
                setDataSource(v === "auto" || v === "okx" || v === "yfinance" || v === "mock" ? (v as DataSourceChoice) : "auto");
              }}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6, background: "#fff" }}
            >
              <option value="auto">Auto (recommended)</option>
              <option value="yfinance">yfinance (Yahoo Finance, 1D)</option>
              <option value="okx">OKX (public, 1D candles)</option>
              {allowMock ? <option value="mock">Mock (deterministic, debug)</option> : null}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={resolvedSource === "okx" ? "e.g. BTC-USDT" : "e.g. SPY / 2800.HK / 2800"}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Start</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>End</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: fetchedSeries.length ? "#555" : "#b00020" }} aria-live="polite">
          Series ({dataChoiceLabel}): {fetchedSeries.length} points — {start} → {end}
          {resolvedSource === "mock" ? (
            <span style={{ marginLeft: 6 }}>(capped at 500 days)</span>
          ) : resolvedSource === "okx" ? (
            <span style={{ marginLeft: 6 }}>(OKX: best-effort; may truncate to recent bars)</span>
          ) : (
            <span style={{ marginLeft: 6 }}>(yfinance: best-effort; market holidays/missing bars possible)</span>
          )}
        </div>
      </section>

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
                disabled={!fetchedSeries.length}
                onClick={() => {
                  setSeriesText(pretty(fetchedSeries));
                  setSeriesTouched(false);
                }}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12, opacity: fetchedSeries.length ? 1 : 0.5 }}
              >
                Use fetched
              </button>
            </div>
            <textarea
              value={seriesText}
              onChange={(e) => {
                setSeriesTouched(true);
                setSeriesText(e.target.value);
              }}
              rows={14}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 6,
                fontFamily: "ui-monospace, SFMono-Regular",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: seriesTouched ? "#b26a00" : "#666" }}>
              {seriesTouched ? "Edited (not auto-syncing with fetched series)" : "Auto-synced with fetched series"}
            </div>
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
