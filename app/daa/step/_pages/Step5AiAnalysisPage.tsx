"use client";

import { useEffect, useMemo, useState } from "react";

import type { MarketEvent } from "@/src/core/marketEvents";

import { analyzeDaaRecommendation } from "@/src/core/aiAnalysis";

import { LS_MARKET_EVENTS, WIZARD_DATA_EVENT, pretty, readJsonFromLs } from "../../wizardStorage";
import { RebalanceSimulatePanel } from "../_components/RebalanceSimulatePanel";

// Demo request is loaded from server-side fixtures (see /api/daa/fixtures).

export default function Step5AiAnalysisPage() {
  const [latestRun, setLatestRun] = useState<{ request: unknown; responseJson: unknown; ok: boolean; httpStatus: number | null } | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);

  useEffect(() => {
    const load = () => {
      const stored = readJsonFromLs<MarketEvent[]>(LS_MARKET_EVENTS);
      setEvents(Array.isArray(stored) ? stored : []);
    };

    load();
    window.addEventListener(WIZARD_DATA_EVENT, load);
    return () => window.removeEventListener(WIZARD_DATA_EVENT, load);
  }, []);

  const analysis = useMemo(() => {
    if (!latestRun?.request || !latestRun?.responseJson) return null;
    return analyzeDaaRecommendation({
      baselineRequest: latestRun.request,
      baselineResponse: latestRun.responseJson,
      marketEvents: events,
    });
  }, [events, latestRun]);

  return (
    <section>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 5 — AI 分析（state-driven）v0</h1>
      <p style={{ color: "#444" }}>
        v0：参考基准推荐，但在“解释层”允许你尝试放宽资金约束，并结合 Step2 的 <code>MarketEvent</code> 作为解释上下文。
        <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}>(no-trade, explain-only)</span>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <RebalanceSimulatePanel
          title="1) Generate baseline recommendation (engine)"
          fixtureEndpoint="/api/daa/fixtures/rebalance-simulate-request-v0"
          onResult={(r) => setLatestRun({ request: r.request, responseJson: r.responseJson, ok: r.ok, httpStatus: r.httpStatus })}
        />

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>2) Market context (from Step2 localStorage)</div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
            Loaded <b>{events.length}</b> events from <code>{LS_MARKET_EVENTS}</code>. (Edit in Step2, then come back here.)
          </div>
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto", border: "1px solid #f1f1f1", padding: 10, borderRadius: 8 }}>
            {pretty(events)}
          </pre>
        </section>

        <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>3) Analysis output</div>
            <button
              type="button"
              disabled={!analysis}
              onClick={() => {
                if (!analysis) return;
                navigator.clipboard.writeText(pretty(analysis));
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                opacity: analysis ? 1 : 0.5,
                fontSize: 12,
              }}
            >
              Copy JSON
            </button>
          </div>

          {!latestRun ? (
            <div style={{ fontSize: 12, color: "#666" }}>Run the baseline simulator first.</div>
          ) : !analysis ? (
            <div style={{ fontSize: 12, color: "#666" }}>Waiting for analysis inputs…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Summary</div>
                <div style={{ fontSize: 12, color: "#333" }}>{analysis.summary}</div>
              </div>

              <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Baseline notes</div>
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{analysis.baselineNotes.join("\n")}</pre>
              </div>

              <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Market notes</div>
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{analysis.marketNotes.join("\n")}</pre>
              </div>

              <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Market citations (traceable back to Step2 events)</div>
                {analysis.marketCitations.length ? (
                  <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(analysis.marketCitations)}</pre>
                ) : (
                  <div style={{ fontSize: 12, color: "#666" }}>No citations (missing market events or no symbol matches).</div>
                )}
              </div>

              <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Alternative scenarios (copy into simulator request)</div>
                {analysis.alternatives.length ? (
                  <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(analysis.alternatives)}</pre>
                ) : (
                  <div style={{ fontSize: 12, color: "#666" }}>No alternatives (missing constraints in request).</div>
                )}
              </div>

              <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Disclaimers</div>
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{analysis.disclaimers.join("\n")}</pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
