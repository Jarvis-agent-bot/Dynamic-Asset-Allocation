"use client";

import { useMemo, useState } from "react";

type SignalAction = "BUY" | "SELL" | "HOLD";

type Signal = {
  date: string;
  action: SignalAction | string;
  targetWeight: number;
  confidence: number;
  reasons: string[];
};

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function normalizeSignals(x: unknown): Signal[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((s: any) => ({
      date: String(s?.date ?? ""),
      action: String(s?.action ?? ""),
      targetWeight: Number(s?.targetWeight ?? 0),
      confidence: Number(s?.confidence ?? 0),
      reasons: Array.isArray(s?.reasons) ? s.reasons.map(String) : [],
    }))
    .filter((s) => s.date && s.action);
}

export default function Step5SignalDecisionPage() {
  const [signalsText, setSignalsText] = useState<string>(
    pretty([
      {
        date: "2026-01-01",
        action: "HOLD",
        targetWeight: 0.5,
        confidence: 0.62,
        reasons: ["rule: within band [0.350, 0.650] & |Δ|<minChange (0.050)"],
      },
      {
        date: "2026-01-02",
        action: "BUY",
        targetWeight: 0.7,
        confidence: 0.85,
        reasons: ["rule: crossed above buyAbove (0.650): prev=0.500 -> tw=0.700"],
      },
    ])
  );

  const { parsed, parseError } = useMemo((): { parsed: unknown; parseError: string } => {
    try {
      return { parsed: JSON.parse(signalsText) as unknown, parseError: "" };
    } catch {
      return { parsed: null, parseError: "signals JSON parse failed" };
    }
  }, [signalsText]);

  const signals = useMemo(() => normalizeSignals(parsed), [parsed]);
  const latest = signals.length ? signals[signals.length - 1] : null;

  const summary = useMemo(() => {
    if (!latest) return null;
    return {
      date: latest.date,
      action: latest.action,
      confidence: latest.confidence,
      targetWeight: latest.targetWeight,
      reasons: latest.reasons,
    };
  }, [latest]);

  const issues = useMemo(() => {
    if (parseError) return [parseError];
    if (!Array.isArray(parsed)) return ["signals must be a JSON array"];
    if (!signals.length) return ["signals array is empty or has no valid items"];

    const last = signals[signals.length - 1];
    const okAction = ["BUY", "SELL", "HOLD"].includes(last.action);

    const out: string[] = [];
    if (!okAction) out.push(`latest.action must be BUY/SELL/HOLD (got: ${String(last.action)})`);
    if (!Number.isFinite(last.targetWeight)) out.push("latest.targetWeight must be finite");
    if (!Number.isFinite(last.confidence)) out.push("latest.confidence must be finite");
    return out;
  }, [parseError, parsed, signals]);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 5 — 信号决策摘要</h1>
      <p style={{ color: "#444" }}>
        v0：把 Step4 输出的 signals（数组）粘贴进来，提取最后一条作为“今日动作摘要”（不做任何推荐/执行）。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Signals (JSON)</div>
        <textarea
          value={signalsText}
          onChange={(e) => setSignalsText(e.target.value)}
          rows={12}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 6,
            fontFamily: "ui-monospace, SFMono-Regular",
          }}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          期望格式：Signal[]（来自 core）：&#123; date, action, targetWeight, confidence, reasons &#125;。
        </div>
      </section>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Validation</div>
            <div style={{ fontSize: 12, color: issues.length ? "#b00020" : "#2e7d32" }}>
              {issues.length ? `${issues.length} issue(s)` : "OK"}
            </div>
          </div>
          {issues.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, color: "#b00020" }}>
              {issues.map((it, idx) => (
                <li key={idx} style={{ margin: "6px 0", fontSize: 12 }}>
                  {it}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, color: "#2e7d32" }}>All checks passed.</div>
          )}
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Latest signal summary</div>
            <button
              onClick={() => navigator.clipboard.writeText(pretty(summary))}
              disabled={!summary}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                opacity: summary ? 1 : 0.5,
              }}
            >
              Copy
            </button>
          </div>
          {summary ? (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(summary)}</pre>
          ) : (
            <div style={{ fontSize: 12, color: "#666" }}>No valid signals.</div>
          )}
        </section>
      </div>
    </main>
  );
}
