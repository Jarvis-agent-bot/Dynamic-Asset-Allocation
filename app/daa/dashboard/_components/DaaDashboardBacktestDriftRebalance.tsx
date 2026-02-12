"use client";

import { useEffect, useMemo, useState } from "react";

import type { PriceBar } from "@/src/core/domain";

import { backtestDriftRebalance, type DriftRebalanceBacktestRequest, type DriftRebalanceBacktestResult } from "@/src/core/backtestDriftRebalance";
import { coerceSeriesBySymbolInput, snapshotsToSeriesBySymbol } from "@/src/core/priceSnapshotsToSeries";

import { copyTextToClipboard } from "../../copyToClipboard";
import { loadRebalancePolicyV1 } from "../../rebalancePolicyStore";
import { loadTargetWeightsV1 } from "../../targetWeightsStore";
import { pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";

const LS_BACKTEST_DRIFT_INPUT = "daa.backtest.driftRebalance.input.v0";
const LS_BACKTEST_DRIFT_RESULT = "daa.backtest.driftRebalance.result.v0";

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "JSON parse failed" };
  }
}

function toWeightMap(items: Array<{ id: string; targetPct: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items || []) {
    const id = String(it?.id ?? "").trim().toUpperCase();
    const w = Number(it?.targetPct ?? 0);
    if (!id) continue;
    if (!Number.isFinite(w) || w < 0) continue;
    out[id] = w;
  }
  return out;
}

function equalWeights(symbols: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const syms = (symbols || []).filter(Boolean);
  if (!syms.length) return out;
  const w = 1 / syms.length;
  for (const s of syms) out[s] = w;
  return out;
}

function fmtPct(x: number): string {
  if (!Number.isFinite(x)) return "-";
  return `${(x * 100).toFixed(2)}%`;
}

function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return "-";
  const abs = Math.abs(x);
  if (abs >= 1e9) return x.toExponential(4);
  if (abs >= 1e6) return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1e3) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return x.toFixed(4);
}

function tryBuildSeriesBySymbol(input: unknown): { ok: true; seriesBySymbol: Record<string, PriceBar[]>; symbols: string[] } | { ok: false; error: string } {
  // 1) Accept direct series map or {seriesBySymbol: ...}
  const coerced = coerceSeriesBySymbolInput(input);
  const symbolsFromSeries = Object.keys(coerced || {}).filter(Boolean).sort();
  if (symbolsFromSeries.length) return { ok: true, seriesBySymbol: coerced, symbols: symbolsFromSeries };

  // 2) Accept price snapshots: [{date, prices}] or {snapshots:[...]} or {"YYYY-MM-DD": {SYM: px}}
  try {
    const s = (() => {
      if (Array.isArray(input)) return input;
      if (input && typeof input === "object" && !Array.isArray(input)) {
        const r: any = input as any;
        if (Array.isArray(r.snapshots)) return r.snapshots;

        // Map form: { "2026-01-01": { SPY: 1, TLT: 2 }, ... }
        const entries = Object.entries(r as Record<string, unknown>);
        const looksLikeDateMap = entries.some(([k]) => /^\d{4}-\d{2}-\d{2}/.test(String(k)));
        if (looksLikeDateMap) {
          return entries.map(([date, prices]) => ({ date, prices }));
        }
      }
      return null;
    })();

    if (!s) return { ok: false, error: "Input is neither seriesBySymbol nor snapshots" };

    const { seriesBySymbol, symbols } = snapshotsToSeriesBySymbol(s as any);
    return { ok: true, seriesBySymbol, symbols };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function DaaDashboardBacktestDriftRebalance() {
  const defaults = useMemo(() => {
    const targetWeights = loadTargetWeightsV1();
    const policy = loadRebalancePolicyV1();

    const targetWeightsMap = toWeightMap(targetWeights);

    return {
      targetWeightsText: Object.keys(targetWeightsMap).length ? pretty(targetWeightsMap) : "",
      policyText: pretty({
        thresholdPct: policy.thresholdPct,
        minTradeNotional: policy.minTradeNotional,
        cooldownSeconds: policy.cooldownSeconds,
      }),
    };
  }, []);

  const [priceInputText, setPriceInputText] = useState(() => {
    const saved = readJsonFromLs<any>(LS_BACKTEST_DRIFT_INPUT);
    if (saved && typeof saved === "object" && typeof saved.priceInputText === "string") return saved.priceInputText;

    return pretty({
      snapshots: [
        { date: "2026-01-01", prices: { SPY: 100, TLT: 90 } },
        { date: "2026-01-02", prices: { SPY: 102, TLT: 89 } },
        { date: "2026-01-03", prices: { SPY: 101, TLT: 91 } },
      ],
    });
  });

  const [targetWeightsText, setTargetWeightsText] = useState(() => {
    const saved = readJsonFromLs<any>(LS_BACKTEST_DRIFT_INPUT);
    if (saved && typeof saved === "object" && typeof saved.targetWeightsText === "string") return saved.targetWeightsText;
    return defaults.targetWeightsText;
  });

  const [policyText, setPolicyText] = useState(() => {
    const saved = readJsonFromLs<any>(LS_BACKTEST_DRIFT_INPUT);
    if (saved && typeof saved === "object" && typeof saved.policyText === "string") return saved.policyText;
    return defaults.policyText;
  });

  const [initialEquity, setInitialEquity] = useState(() => {
    const saved = readJsonFromLs<any>(LS_BACKTEST_DRIFT_INPUT);
    const n = Number(saved?.initialEquity ?? 100);
    return Number.isFinite(n) && n > 0 ? n : 100;
  });

  const [bootstrapToTarget, setBootstrapToTarget] = useState(() => {
    const saved = readJsonFromLs<any>(LS_BACKTEST_DRIFT_INPUT);
    return saved?.bootstrapToTarget === false ? false : true;
  });

  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<DriftRebalanceBacktestResult | null>(() => {
    const saved = readJsonFromLs<any>(LS_BACKTEST_DRIFT_RESULT);
    return saved && typeof saved === "object" && saved.schemaVersion === 1 ? (saved as DriftRebalanceBacktestResult) : null;
  });

  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    saveJsonToLs(LS_BACKTEST_DRIFT_INPUT, { priceInputText, targetWeightsText, policyText, initialEquity, bootstrapToTarget });
  }, [priceInputText, targetWeightsText, policyText, initialEquity, bootstrapToTarget]);

  const derived = useMemo(() => {
    const parsed = safeJsonParse(priceInputText);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    return tryBuildSeriesBySymbol(parsed.value);
  }, [priceInputText]);

  function buildRequestOrError(): { ok: true; req: DriftRebalanceBacktestRequest; symbols: string[] } | { ok: false; error: string } {
    if (!derived.ok) return { ok: false, error: derived.error };
    const symbols = derived.symbols;

    const tw = (() => {
      const raw = String(targetWeightsText ?? "").trim();
      if (!raw) return equalWeights(symbols);
      const p = safeJsonParse(raw);
      if (!p.ok) throw new Error(`targetWeights: ${p.error}`);

      // Accept map form; also accept array form via normalizeTargetWeightsInput semantics.
      if (Array.isArray(p.value)) {
        // array -> map with {id,targetPct}
        const out: Record<string, number> = {};
        for (const row of p.value as any[]) {
          const id = String((row as any)?.id ?? (row as any)?.symbol ?? "").trim().toUpperCase();
          const w = Number((row as any)?.targetPct ?? (row as any)?.weight ?? 0);
          if (!id) continue;
          if (!Number.isFinite(w) || w < 0) continue;
          out[id] = w > 1 && w <= 100 ? w / 100 : w;
        }
        return Object.keys(out).length ? out : equalWeights(symbols);
      }

      if (p.value && typeof p.value === "object") {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(p.value as Record<string, unknown>)) {
          const id = String(k ?? "").trim().toUpperCase();
          const w0 = Number(v ?? 0);
          if (!id) continue;
          if (!Number.isFinite(w0) || w0 < 0) continue;
          out[id] = w0 > 1 && w0 <= 100 ? w0 / 100 : w0;
        }
        return Object.keys(out).length ? out : equalWeights(symbols);
      }

      return equalWeights(symbols);
    })();

    const pol = (() => {
      const raw = String(policyText ?? "").trim();
      if (!raw) return undefined;
      const p = safeJsonParse(raw);
      if (!p.ok) throw new Error(`policy: ${p.error}`);
      if (!p.value || typeof p.value !== "object" || Array.isArray(p.value)) return undefined;

      const r: any = p.value as any;
      const thresholdPct = Number(r.thresholdPct ?? 0);
      const minTradeNotional = r.minTradeNotional === undefined ? undefined : Number(r.minTradeNotional ?? 0);
      const cooldownSeconds = r.cooldownSeconds === undefined ? undefined : Number(r.cooldownSeconds ?? 0);

      const out: any = {
        thresholdPct: Number.isFinite(thresholdPct) ? thresholdPct : 0,
      };
      if (minTradeNotional !== undefined && Number.isFinite(minTradeNotional)) out.minTradeNotional = Math.max(0, minTradeNotional);
      if (cooldownSeconds !== undefined && Number.isFinite(cooldownSeconds)) out.cooldownSeconds = Math.max(0, cooldownSeconds);
      return out;
    })();

    const eq = Number(initialEquity ?? 0);
    if (!(Number.isFinite(eq) && eq > 0)) return { ok: false, error: "initialEquity must be > 0" };

    const req: DriftRebalanceBacktestRequest = {
      seriesBySymbol: derived.seriesBySymbol,
      targetWeights: tw,
      initialEquity: eq,
      policy: pol,
      bootstrapToTarget,
      // v0: keep constraints empty unless the user explicitly pastes them (we can add a UI later).
    };

    return { ok: true, req, symbols };
  }

  function run() {
    setRunError(null);
    setCopyStatus("idle");

    try {
      const built = buildRequestOrError();
      if (!built.ok) {
        setResult(null);
        setRunError(built.error);
        return;
      }

      const res = backtestDriftRebalance(built.req);
      setResult(res);
      saveJsonToLs(LS_BACKTEST_DRIFT_RESULT, res);
    } catch (e) {
      setResult(null);
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }

  const summary = useMemo(() => {
    if (!result) return null;

    return {
      totalReturn: result.metrics.totalReturn,
      maxDrawdown: result.metrics.maxDrawdown,
      sharpe: result.metrics.sharpe,
      winRate: result.metrics.winRate,
      initialEquityAbs: result.summary.initialEquityAbs,
      finalEquityAbs: result.summary.finalEquityAbs,
      rebalanceCount: result.summary.rebalanceCount,
      turnoverNotional: result.summary.turnoverNotional,
      warnings: result.warnings,
    };
  }, [result]);

  async function copyOutput() {
    if (!result) return;
    try {
      await copyTextToClipboard(pretty(result));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  async function copyRequest() {
    try {
      const built = buildRequestOrError();
      if (!built.ok) {
        setRunError(built.error);
        return;
      }

      await copyTextToClipboard(pretty(built.req));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14 }}>Backtest — Drift + Rebalance simulator（v0）</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            粘贴 <b>价格序列</b>（seriesBySymbol）或 <b>价格快照序列</b>（snapshots）→ 运行 drift+rebalance 回测 → 输出指标摘要（用于复盘/调参）。
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={run}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Run backtest
          </button>
          <button type="button" onClick={copyRequest} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Copy request
          </button>
          <button type="button" disabled={!result} onClick={copyOutput} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: result ? "#fafafa" : "#f3f3f3", color: result ? "#111" : "#888", fontSize: 12 }}>
            Copy output
          </button>
          {copyStatus === "copied" ? <span style={{ fontSize: 12, color: "#0a7" }}>Copied</span> : null}
          {copyStatus === "failed" ? <span style={{ fontSize: 12, color: "#b00020" }}>Copy failed</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Price input (JSON)</div>
          <textarea value={priceInputText} onChange={(e) => setPriceInputText(e.target.value)} rows={14} style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, padding: 10, borderRadius: 10, border: "1px solid #e5e5e5" }} />
          <div style={{ marginTop: 6, fontSize: 12, color: derived.ok ? "#666" : "#b00020" }}>
            {derived.ok ? `Detected symbols: ${derived.symbols.join(", ")}` : `Input error: ${derived.error}`}
          </div>
        </div>

        <div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>initialEquity</span>
              <input type="number" value={initialEquity} onChange={(e) => setInitialEquity(Number(e.target.value))} style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e5e5" }} />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={bootstrapToTarget} onChange={(e) => setBootstrapToTarget(e.target.checked)} />
              Bootstrap to target weights on day 0
            </label>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>targetWeights (optional JSON)</div>
              <textarea value={targetWeightsText} onChange={(e) => setTargetWeightsText(e.target.value)} rows={5} style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, padding: 10, borderRadius: 10, border: "1px solid #e5e5e5" }} />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>留空则默认 equal-weights（按 detected symbols）。</div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>policy (optional JSON)</div>
              <textarea value={policyText} onChange={(e) => setPolicyText(e.target.value)} rows={5} style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, padding: 10, borderRadius: 10, border: "1px solid #e5e5e5" }} />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>默认从 Funds hub 的 rebalance policy store 读取（可直接覆盖）。</div>
            </div>
          </div>
        </div>
      </div>

      {runError ? <div style={{ marginTop: 10, fontSize: 12, color: "#b00020" }}>Run error: {runError}</div> : null}

      {summary ? (
        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 13 }}>Summary</div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
            <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10, background: "#fafafa" }}>
              <div style={{ fontWeight: 800 }}>Performance</div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                <div>totalReturn: {fmtPct(summary.totalReturn)}</div>
                <div>maxDrawdown: {fmtPct(summary.maxDrawdown)}</div>
                <div>sharpe: {fmtNum(summary.sharpe)}</div>
                <div>winRate: {fmtPct(summary.winRate)}</div>
              </div>
            </div>

            <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10, background: "#fafafa" }}>
              <div style={{ fontWeight: 800 }}>Rebalance</div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                <div>initialEquityAbs: {fmtNum(summary.initialEquityAbs)}</div>
                <div>finalEquityAbs: {fmtNum(summary.finalEquityAbs)}</div>
                <div>rebalanceCount: {String(summary.rebalanceCount)}</div>
                <div>turnoverNotional: {fmtNum(summary.turnoverNotional)}</div>
              </div>
            </div>
          </div>

          {summary.warnings?.length ? (
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <div style={{ fontWeight: 800, color: "#b45309" }}>Warnings</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#b45309" }}>
                {summary.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#444" }}>Raw output JSON</summary>
            <pre style={{ marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #eee", background: "#fcfcfc", fontSize: 12, overflow: "auto" }}>{pretty(result)}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
