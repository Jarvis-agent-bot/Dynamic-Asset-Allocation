"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeDaaRecommendation, type AiAnalysis } from "@/src/core/aiAnalysis";

import {
  LS_MARKET_EVENTS,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  pretty,
  readJsonFromLs,
} from "../../wizardStorage";

export default function DaaDashboardAiExplain() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener("storage", onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener("storage", onData);
    };
  }, []);

  const marketEvents = useMemo(() => readJsonFromLs(LS_MARKET_EVENTS), [rev]);
  const rebalanceReq = useMemo(() => readJsonFromLs(LS_REBALANCE_REQUEST), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);

  const analysis: AiAnalysis | null = useMemo(() => {
    if (!rebalanceReq || !rebalanceResp) return null;
    try {
      return analyzeDaaRecommendation({
        baselineRequest: rebalanceReq,
        baselineResponse: rebalanceResp,
        marketEvents,
      });
    } catch {
      return null;
    }
  }, [marketEvents, rebalanceReq, rebalanceResp]);

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Step 5 — Explain（AI 辅助解释）v0</h2>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            读取 Step4 的 recommendation + Step2 的 MarketEvent，生成一个可追溯的解释（不下单）。
          </div>
        </div>

        <button
          type="button"
          disabled={!analysis}
          onClick={() => (analysis ? navigator.clipboard.writeText(pretty(analysis)) : null)}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            fontSize: 12,
            opacity: analysis ? 1 : 0.5,
          }}
        >
          Copy JSON
        </button>
      </div>

      {!rebalanceResp ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Missing recommendation. Go to Step4 and run the simulator once (it will persist the latest response in localStorage).
        </div>
      ) : !analysis ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>Waiting for inputs…</div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Summary</div>
            <div style={{ fontSize: 12, color: "#333" }}>{analysis.summary}</div>
          </div>

          <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Market citations (traceable to Step2 events)</div>
            {analysis.marketCitations.length ? (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(analysis.marketCitations)}</pre>
            ) : (
              <div style={{ fontSize: 12, color: "#666" }}>No citations (missing market events or no symbol matches).</div>
            )}
          </div>

          <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Alternatives (constraint patches)</div>
            {analysis.alternatives.length ? (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(analysis.alternatives)}</pre>
            ) : (
              <div style={{ fontSize: 12, color: "#666" }}>No alternatives.</div>
            )}
          </div>

          <details style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 12 }}>Full output</summary>
            <pre style={{ margin: "10px 0 0", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(analysis)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
