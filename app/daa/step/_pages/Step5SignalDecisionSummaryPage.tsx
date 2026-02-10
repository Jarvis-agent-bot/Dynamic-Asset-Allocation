"use client";

import { useMemo, useState } from "react";

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
    if (!(["BUY", "SELL", "HOLD"] as const).includes(latest.action as "BUY" | "SELL" | "HOLD")) {
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

export default function Step5SignalDecisionSummaryPage() {
  const [rawJson, setRawJson] = useState(DEFAULT_SIGNALS_JSON);
  const [copyState, setCopyState] = useState<string>("");

  const { latest, issues } = useMemo(() => {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const norm = normalizeSignals(parsed);
      return { latest: norm.signals.at(-1) ?? null, issues: norm.issues };
    } catch {
      return { latest: null, issues: ["signals JSON parse failed"] };
    }
  }, [rawJson]);

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

  async function onCopy() {
    if (!summaryJson) return;

    try {
      await navigator.clipboard.writeText(summaryJson);
      setCopyState("Copied");
      window.setTimeout(() => setCopyState(""), 1200);
    } catch {
      setCopyState("Copy failed");
      window.setTimeout(() => setCopyState(""), 2000);
    }
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 5 — 信号决策摘要（Signal decision summary）v0</h1>
      <p style={{ color: "#444" }}>
        v0：把 Step4 的 <code>signals: Signal[]</code>（JSON 数组）粘贴进来，提取最后一条作为“今日动作摘要”，仅做结构化展示与校验。
      </p>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Signals (JSON)</h2>
          <div style={{ fontSize: 12, color: issues.length ? "#b00020" : "#2e7d32" }}>{issues.length ? `${issues.length} issue(s)` : "OK"}</div>
        </div>

        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
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

        {issues.length ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff5f5", border: "1px solid #ffd6d6" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#b00020" }}>Validation</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#b00020", fontSize: 12 }}>
              {issues.map((msg, idx) => (
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
              onClick={onCopy}
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
    </main>
  );
}
