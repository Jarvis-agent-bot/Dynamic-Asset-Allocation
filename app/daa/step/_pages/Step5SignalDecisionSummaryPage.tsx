"use client";

import { useEffect, useMemo, useState } from "react";

import type { MoneyPlan } from "../../../../src/core/money";
import { validateMoneyPlan } from "../../../../src/core/money";

import { LS_MONEY_PLAN, pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";

type NormalizedSignal = {
  date: string;
  action: string;
  targetWeight: number;
  confidence: number;
  reasons: string[];
};


const DEFAULT_SIGNALS_JSON = JSON.stringify(
  [
    {
      date: "2026-02-10",
      action: "HOLD",
      targetWeight: 0.55,
      confidence: 0.42,
      reasons: ["waiting for confirmation"],
    },
    {
      date: "2026-02-11",
      action: "BUY",
      targetWeight: 0.65,
      confidence: 0.78,
      reasons: ["trend up", "risk-on"],
    },
  ],
  null,
  2,
);

const DEFAULT_MONEY_PLAN: MoneyPlan = {
  account: {
    baseCcy: "USD",
    totalEquity: 100000,
    cash: 20000,
    investable: 80000,
  },
  constraints: {
    maxPositionPct: 0.35,
    maxIn: 20000,
    maxOut: 20000,
  },
  allocations: [
    { id: "core_equity", label: "Core Equity", targetPct: 0.6, tags: { riskPreference: "mid", riskScore: "mid" } },
    { id: "defensive", label: "Defensive", targetPct: 0.25, tags: { riskPreference: "low", riskScore: "low" } },
    { id: "opportunistic", label: "Opportunistic", targetPct: 0.15, tags: { riskPreference: "high", riskScore: "high" } },
  ],
};

function normalizeSignals(input: unknown): { signals: NormalizedSignal[]; issues: string[] } {
  const issues: string[] = [];

  if (!Array.isArray(input)) {
    issues.push("signals must be a JSON array");
    return { signals: [], issues };
  }

  const normalized = input
    .map((raw) => {
      const obj = (raw ?? {}) as Record<string, unknown>;

      const date = String(obj.date ?? "").trim();
      const action = String(obj.action ?? "").trim();
      const targetWeight = Number(obj.targetWeight);
      const confidence = Number(obj.confidence);
      const reasons = Array.isArray(obj.reasons) ? obj.reasons.map((x) => String(x)) : [];

      return { date, action, targetWeight, confidence, reasons };
    })
    .filter((s) => Boolean(s.date) && Boolean(s.action));

  if (!normalized.length) {
    issues.push("signals array is empty or has no valid items");
  }

  const latest = normalized.at(-1);
  if (latest) {
    if (!( ["BUY", "SELL", "HOLD"] as const).includes(latest.action as "BUY" | "SELL" | "HOLD")) {
      issues.push("latest.action must be BUY | SELL | HOLD");
    }
    if (!Number.isFinite(latest.targetWeight)) {
      issues.push("latest.targetWeight must be a finite number");
    }
    if (!Number.isFinite(latest.confidence)) {
      issues.push("latest.confidence must be a finite number");
    }
  }

  return { signals: normalized, issues };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function formatPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

export default function Step5SignalDecisionSummaryPage() {
  const [rawSignalsJson, setRawSignalsJson] = useState(DEFAULT_SIGNALS_JSON);
  const [moneyPlanText, setMoneyPlanText] = useState(pretty(DEFAULT_MONEY_PLAN));
  const [copyState, setCopyState] = useState<string>("");
  const [copySizingState, setCopySizingState] = useState<string>("");

  useEffect(() => {
    const stored = readJsonFromLs<MoneyPlan>(LS_MONEY_PLAN);
    if (stored) {
      setMoneyPlanText(pretty(stored));
    }
  }, []);

  const { latest, signalIssues } = useMemo(() => {
    try {
      const parsed = JSON.parse(rawSignalsJson) as unknown;
      const norm = normalizeSignals(parsed);
      return { latest: norm.signals.at(-1) ?? null, signalIssues: norm.issues };
    } catch {
      return { latest: null, signalIssues: ["signals JSON parse failed"] };
    }
  }, [rawSignalsJson]);

  const { moneyPlan, moneyPlanJsonOk, moneyPlanIssues } = useMemo(() => {
    let parsedUnknown: unknown = null;
    let ok = true;

    try {
      parsedUnknown = JSON.parse(moneyPlanText) as unknown;
    } catch {
      ok = false;
      parsedUnknown = null;
    }

    const plan = (parsedUnknown ?? {}) as MoneyPlan;

    const issues = ok ? validateMoneyPlan(plan as MoneyPlan) : [{ path: "money_plan", message: "must be valid JSON" }];

    return {
      moneyPlan: plan,
      moneyPlanJsonOk: ok,
      moneyPlanIssues: issues,
    };
  }, [moneyPlanText]);

  const summaryJson = latest
    ? JSON.stringify(
        {
          date: latest.date,
          action: latest.action,
          confidence: latest.confidence,
          targetWeight: latest.targetWeight,
          reasons: latest.reasons,
        },
        null,
        2,
      )
    : "";

  const sizingJson = useMemo(() => {
    if (!latest) return "";
    if (!moneyPlanJsonOk) return "";
    if (moneyPlanIssues.length) return "";

    const totalEquity = Number(moneyPlan?.account?.totalEquity);
    const maxPositionPct = Number(moneyPlan?.constraints?.maxPositionPct);
    const maxIn = Number(moneyPlan?.constraints?.maxIn);
    const maxOut = Number(moneyPlan?.constraints?.maxOut);

    if (!Number.isFinite(totalEquity) || totalEquity <= 0) return "";

    const targetWeight = clamp01(Number(latest.targetWeight));
    const targetAbs = targetWeight * totalEquity;

    const minAbs = Math.max(0, targetAbs - Math.max(0, maxOut));
    const maxAbs = Math.min(Math.max(0, maxPositionPct) * totalEquity, targetAbs + Math.max(0, maxIn));

    const range = {
      baseCcy: String(moneyPlan?.account?.baseCcy ?? ""),
      totalEquity,
      constraints: {
        maxPositionPct,
        maxIn,
        maxOut,
      },
      latestSignal: {
        date: latest.date,
        action: latest.action,
        targetWeight,
        confidence: latest.confidence,
      },
      derived: {
        targetAbs,
        feasibleAbsRange: [minAbs, maxAbs],
        feasibleWeightRange: [minAbs / totalEquity, maxAbs / totalEquity],
        note:
          "v0 sizing: uses targetWeight * totalEquity as anchor, then applies maxIn/maxOut and maxPositionPct to derive a feasible range. Does not know current holdings; treat as an indicative bound, not an executable order.",
      },
    };

    return JSON.stringify(range, null, 2);
  }, [latest, moneyPlan, moneyPlanIssues.length, moneyPlanJsonOk]);

  async function copyToClipboard(text: string, setState: (x: string) => void) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setState("Copied");
      window.setTimeout(() => setState(""), 1200);
    } catch {
      setState("Copy failed");
      window.setTimeout(() => setState(""), 2000);
    }
  }

  return (
    <section>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 5 — 信号决策摘要（Signal decision summary）v0</h1>
      <p style={{ color: "#444" }}>
        v0：粘贴 <code>signals: Signal[]</code>（JSON 数组），提取最后一条作为“今日动作摘要”。可选：接入 Step3 的 money plan，输出一个“目标仓位可行范围”（不生成可执行指令）。
      </p>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Signals (JSON)</h2>
          <div style={{ fontSize: 12, color: signalIssues.length ? "#b00020" : "#2e7d32" }}>{signalIssues.length ? `${signalIssues.length} issue(s)` : "OK"}</div>
        </div>

        <textarea
          value={rawSignalsJson}
          onChange={(e) => setRawSignalsJson(e.target.value)}
          spellCheck={false}
          style={{
            marginTop: 10,
            width: "100%",
            minHeight: 220,
            border: "1px solid #e5e5e5",
            borderRadius: 10,
            padding: 10,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
          }}
        />

        {signalIssues.length ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff5f5", border: "1px solid #ffd6d6" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#b00020" }}>Validation</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#b00020", fontSize: 12 }}>
              {signalIssues.map((msg, idx) => (
                <li key={`${msg}-${idx}`}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Latest signal summary</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {copyState ? <span style={{ fontSize: 12, color: copyState === "Copied" ? "#2e7d32" : "#b00020" }}>{copyState}</span> : null}
            <button
              type="button"
              onClick={() => copyToClipboard(summaryJson, setCopyState)}
              disabled={!summaryJson}
              style={{
                cursor: summaryJson ? "pointer" : "not-allowed",
                opacity: summaryJson ? 1 : 0.5,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e5e5",
                background: "#fafafa",
                fontSize: 12,
              }}
            >
              Copy
            </button>
          </div>
        </div>

        <pre
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e5e5",
            background: "#fafafa",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {summaryJson || "(no valid signals)"}
        </pre>
      </section>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Money plan (JSON)</h2>
          <div style={{ fontSize: 12, color: moneyPlanIssues.length ? "#b00020" : "#2e7d32" }}>{moneyPlanIssues.length ? `${moneyPlanIssues.length} issue(s)` : "OK"}</div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              const stored = readJsonFromLs<MoneyPlan>(LS_MONEY_PLAN);
              if (stored) setMoneyPlanText(pretty(stored));
            }}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
          >
            Load from Step3 (LocalStorage)
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                const parsed = JSON.parse(moneyPlanText) as unknown;
                saveJsonToLs(LS_MONEY_PLAN, parsed);
              } catch {
                // ignore
              }
            }}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
          >
            Save to Wizard (LocalStorage)
          </button>
        </div>

        <textarea
          value={moneyPlanText}
          onChange={(e) => setMoneyPlanText(e.target.value)}
          spellCheck={false}
          style={{
            marginTop: 10,
            width: "100%",
            minHeight: 220,
            border: "1px solid #e5e5e5",
            borderRadius: 10,
            padding: 10,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
          }}
        />

        {moneyPlanIssues.length ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff5f5", border: "1px solid #ffd6d6" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#b00020" }}>Validation</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#b00020", fontSize: 12 }}>
              {moneyPlanIssues.map((it, idx) => (
                <li key={`${it.path}-${idx}`}>
                  <code>{it.path}</code>: {it.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Sizing hint (money plan × latest signal)</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {latest ? (
              <span style={{ fontSize: 12, color: "#666" }}>
                targetWeight: <b>{formatPct(clamp01(latest.targetWeight))}</b>
              </span>
            ) : null}
            {copySizingState ? <span style={{ fontSize: 12, color: copySizingState === "Copied" ? "#2e7d32" : "#b00020" }}>{copySizingState}</span> : null}
            <button
              type="button"
              onClick={() => copyToClipboard(sizingJson, setCopySizingState)}
              disabled={!sizingJson}
              style={{
                cursor: sizingJson ? "pointer" : "not-allowed",
                opacity: sizingJson ? 1 : 0.5,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e5e5",
                background: "#fafafa",
                fontSize: 12,
              }}
            >
              Copy
            </button>
          </div>
        </div>

        <pre
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e5e5",
            background: "#fafafa",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {sizingJson || "(provide valid latest signal + money plan to see sizing range)"}
        </pre>
      </section>
    </section>
  );
}
