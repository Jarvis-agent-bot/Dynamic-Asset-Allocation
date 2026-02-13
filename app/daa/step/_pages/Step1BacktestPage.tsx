"use client";

import { useEffect, useMemo, useState } from "react";

import { backtestSingleAsset, rankBacktestResults, type RankedBacktestResult } from "../../../../src/core/backtest";
import {
  createDeterministicMockPriceSeriesProvider,
  createOkxPublicPriceSeriesProvider,
  createYfinancePublicPriceSeriesProvider,
  fetchValidatedPriceSeriesEnforcingRange,
} from "../../../../src/core/providers";
import { recommendEnsembleWeightsFromRankedResults } from "../../../../src/core/recommendEnsembleWeights";
import { buyAndHold, smaCrossover } from "../../../../src/core/strategies";
import { inferStep1PriceSeriesSource } from "../../../../src/daa/step1PriceSeriesSource";

import { LS_STEP1_BACKTEST, saveJsonToLs } from "../../wizardStorage";

type Step1Result = {
  schemaVersion: 1;
  generatedAt: string;

  ranked: RankedBacktestResult[];
  input: unknown;
  output?: unknown;

  summary?: {
    bestStrategyId: string;
    bestStrategyName: string;
    bestScore: number;
    metrics: RankedBacktestResult["metrics"];
    weightsConfig: Record<string, number>;
  };
} & Record<string, unknown>;

type DataSourceChoice = "auto" | "yfinance" | "okx" | "mock";

type ResolvedSource = Exclude<DataSourceChoice, "auto">;

function jsonPretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function isMockDebugEnabled(): boolean {
  // Client-only page; using window is OK. This avoids accidentally shipping mock as
  // a "real" option in the normal user flow.
  if (typeof window === "undefined") return false;
  const qs = new URLSearchParams(window.location.search);
  return qs.get("debug") === "1" || qs.get("mock") === "1" || qs.get("daaMock") === "1";
}

export default function Step1BacktestPage() {
  const [dataSource, setDataSource] = useState<DataSourceChoice>("auto");
  const [symbol, setSymbol] = useState("SPY");
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-02-01");
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<Step1Result | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

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

  const [series, setSeries] = useState<Array<{ date: string; close: number }>>([]);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  // Step1 v0: default to real data sources.
  // - Non-crypto: yfinance daily bars (server-side route to avoid CORS).
  // - Crypto: OKX public candles.
  // - Mock: debug-only deterministic series for quick regressions.
  useEffect(() => {
    let cancelled = false;

    async function runFetch() {
      setSeriesError(null);

      try {
        const provider =
          resolvedSource === "okx"
            ? createOkxPublicPriceSeriesProvider({ bar: "1D" })
            : resolvedSource === "yfinance"
              ? createYfinancePublicPriceSeriesProvider()
              : createDeterministicMockPriceSeriesProvider({ maxDays: 200 });

        const next = await fetchValidatedPriceSeriesEnforcingRange(provider, {
          symbol: String(symbol || "")
            .trim()
            .toUpperCase(),
          start,
          end,
        });

        if (!cancelled) setSeries(next);
      } catch (e) {
        if (cancelled) return;
        setSeries([]);
        setSeriesError(e instanceof Error ? e.message : String(e));
      }
    }

    // Keep validationError as the primary UI guard.
    if (!validationError) {
      void runFetch();
    } else {
      setSeries([]);
      setSeriesError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [resolvedSource, symbol, start, end, validationError]);

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
      setRunError(seriesError ? `No price data: ${seriesError}` : "No price data (mock series empty for this date range)");
      setResult(null);
      return;
    }
    try {
      const results = strategies.map((s) => backtestSingleAsset(s, series));
      const ranked = rankBacktestResults(results);
      const recommendedWeightsConfig = recommendEnsembleWeightsFromRankedResults(ranked);

      const top = ranked[0];
      const next: Step1Result = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        input: {
          symbol,
          start,
          end,
          dataSource: resolvedSource,
          strategies: strategies.map((s) => ({ id: s.id, name: s.name })),
        },
        ranked,
        output: {
          weightsConfig: recommendedWeightsConfig,
        },
        summary: top
          ? {
              bestStrategyId: String(top.strategyId),
              bestStrategyName: String(top.strategyName),
              bestScore: Number(top.score),
              metrics: top.metrics,
              weightsConfig: recommendedWeightsConfig,
            }
          : undefined,
      };

      setResult(next);
      // Write-back so the Funds hub / Wizard summary can show the latest strategy+metrics.
      saveJsonToLs(LS_STEP1_BACKTEST, next);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  }

  const dataChoiceLabel = useMemo(() => {
    if (dataSource !== "auto") return dataSource;
    return `auto → ${resolvedSource}`;
  }, [dataSource, resolvedSource]);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 1 — 回测算法组合</h1>
      <p style={{ color: "#444" }}>
        v0：默认使用真实数据源（非 crypto → yfinance；crypto → OKX）。Mock 仅用于 debug（URL 加 <code>?debug=1</code>）。
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
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
        Series ({dataChoiceLabel}): {series.length} points — {start} → {end}
        {resolvedSource === "mock" ? (
          <span style={{ marginLeft: 6 }}>(capped at 200 days)</span>
        ) : resolvedSource === "okx" ? (
          <span style={{ marginLeft: 6 }}>(OKX: best-effort; may truncate to recent bars)</span>
        ) : (
          <span style={{ marginLeft: 6 }}>(yfinance: best-effort; market holidays/missing bars possible)</span>
        )}
        {seriesError ? <span style={{ marginLeft: 8 }}>({seriesError})</span> : null}
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
                    score={r.score.toFixed(4)} | totalReturn={(r.metrics.totalReturn * 100).toFixed(2)}% | mdd={(r.metrics.maxDrawdown * 100).toFixed(2)}% | sharpe={r.metrics.sharpe.toFixed(2)} | winRate={(r.metrics.winRate * 100).toFixed(1)}%
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
