"use client";

import { useMemo, useState } from "react";

import { validateMoneyPlan } from "../../../../src/core/money";

function pretty(x) {
  return JSON.stringify(x, null, 2);
}

export default function Step3MoneyManagementPage() {
  const [baseCcy, setBaseCcy] = useState("USD");
  const [totalEquity, setTotalEquity] = useState(100000);
  const [cash, setCash] = useState(20000);
  const [investable, setInvestable] = useState(80000);

  const [maxPositionPct, setMaxPositionPct] = useState(0.35);
  const [maxIn, setMaxIn] = useState(20000);
  const [maxOut, setMaxOut] = useState(20000);

  const [allocationsText, setAllocationsText] = useState(
    pretty([
      { id: "core_equity", label: "Core Equity", targetPct: 0.6, tags: { riskPreference: "mid", riskScore: "mid" } },
      { id: "defensive", label: "Defensive", targetPct: 0.25, tags: { riskPreference: "low", riskScore: "low" } },
      { id: "opportunistic", label: "Opportunistic", targetPct: 0.15, tags: { riskPreference: "high", riskScore: "high" } }
    ])
  );

  const plan = useMemo(() => {
    let allocations;
    try {
      allocations = JSON.parse(allocationsText);
    } catch {
      allocations = [];
    }

    return {
      account: {
        baseCcy,
        totalEquity: Number(totalEquity),
        cash: Number(cash),
        investable: Number(investable),
      },
      constraints: {
        maxPositionPct: Number(maxPositionPct),
        maxIn: Number(maxIn),
        maxOut: Number(maxOut),
      },
      allocations: Array.isArray(allocations) ? allocations : [],
    };
  }, [baseCcy, totalEquity, cash, investable, maxPositionPct, maxIn, maxOut, allocationsText]);

  const issues = useMemo(() => validateMoneyPlan(plan), [plan]);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 3 — 金额管理</h1>
      <p style={{ color: "#444" }}>
        v0：先把资金池、分配比例、Tag、约束（max in/out、最大持仓比例）的输入结构与校验做出来；为 Step4 推荐算法提供输入。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Account</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Base currency</span>
            <input value={baseCcy} onChange={(e) => setBaseCcy(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Total equity</span>
            <input type="number" value={totalEquity} onChange={(e) => setTotalEquity(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Cash</span>
            <input type="number" value={cash} onChange={(e) => setCash(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Investable</span>
            <input type="number" value={investable} onChange={(e) => setInvestable(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
        </div>
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Constraints</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Max position % (0..1)</span>
            <input type="number" step="0.01" value={maxPositionPct} onChange={(e) => setMaxPositionPct(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Max in (absolute)</span>
            <input type="number" value={maxIn} onChange={(e) => setMaxIn(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Max out (absolute)</span>
            <input type="number" value={maxOut} onChange={(e) => setMaxOut(e.target.value)} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }} />
          </label>
        </div>
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Allocations (JSON)</div>
        <textarea
          value={allocationsText}
          onChange={(e) => setAllocationsText(e.target.value)}
          rows={10}
          style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 6, fontFamily: "ui-monospace, SFMono-Regular" }}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          v0：允许 sum(targetPct) ≤ 1（保留现金）；超过 1 会报错。Tag 支持 riskPreference/riskScore。
        </div>
      </section>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Validation</div>
            <div style={{ fontSize: 12, color: issues.length ? "#b00020" : "#2e7d32" }}>{issues.length ? `${issues.length} issue(s)` : "OK"}</div>
          </div>
          {issues.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, color: "#b00020" }}>
              {issues.map((it, idx) => (
                <li key={idx} style={{ margin: "6px 0", fontSize: 12 }}>
                  <code>{it.path}</code>: {it.message}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, color: "#2e7d32" }}>All checks passed.</div>
          )}
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>Plan JSON</div>
            <button
              onClick={() => navigator.clipboard.writeText(pretty(plan))}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Copy
            </button>
          </div>
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(plan)}</pre>
        </section>
      </div>
    </main>
  );
}
