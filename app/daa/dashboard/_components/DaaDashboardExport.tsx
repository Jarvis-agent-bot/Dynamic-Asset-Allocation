"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeDaaRecommendation } from "@/src/core/aiAnalysis";

import {
  LS_HUMAN_PROFILE,
  LS_MARKET_EVENTS,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  pretty,
  readJsonFromLs,
} from "../../wizardStorage";
import { LS_TAG_TAXONOMY, loadTagTaxonomy } from "../../tagTaxonomy";

export default function DaaDashboardExport() {
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
  const humanProfile = useMemo(() => readJsonFromLs(LS_HUMAN_PROFILE), [rev]);

  const tagTaxonomyRaw = useMemo(() => readJsonFromLs(LS_TAG_TAXONOMY), [rev]);
  const tagTaxonomy = useMemo(() => loadTagTaxonomy(), [rev]);

  const aiExplain = useMemo(() => {
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

  const exportBundle = useMemo(
    () => ({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),

      // Core path: Step2 -> Step4 -> Step5 -> Step6 -> Step7
      market_events: marketEvents,
      rebalance_request: rebalanceReq,
      recommendation: rebalanceResp,
      ai_explain: aiExplain,
      human_profile: humanProfile,
      tag_taxonomy: tagTaxonomy,

      // Debug/traceability: tells whether Step7 taxonomy is default or configured.
      meta: {
        tagTaxonomyConfigured: !!tagTaxonomyRaw,
      },
    }),
    [aiExplain, humanProfile, marketEvents, rebalanceReq, rebalanceResp, tagTaxonomy, tagTaxonomyRaw]
  );

  const marketEventCount = Array.isArray(marketEvents) ? marketEvents.length : 0;
  const hasRecommendation = !!rebalanceResp;
  const hasHuman = !!humanProfile;
  const hasTags = !!tagTaxonomyRaw;

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>一键导出（Dashboard bundle）</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            把 Step2→Step4/5→Step6→Step7 的数据打包成一个 JSON，方便复制/分享/复盘。
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(pretty(exportBundle))}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", fontSize: 12 }}
        >
          Copy export JSON
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: marketEventCount ? "#f0fdf4" : "#fafafa" }}>
          Step2 events: <b>{marketEventCount}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasRecommendation ? "#f0fdf4" : "#fafafa" }}>
          Step4/rec: <b>{hasRecommendation ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: aiExplain ? "#f0fdf4" : "#fafafa" }}>
          Step5 explain: <b>{aiExplain ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasHuman ? "#f0fdf4" : "#fafafa" }}>
          Step6 human: <b>{hasHuman ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasTags ? "#f0fdf4" : "#fafafa" }}>
          Step7 tags: <b>{hasTags ? "configured" : "default"}</b>
        </span>
      </div>

      {!hasRecommendation ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Tip: 先在 Step4 生成一次 recommendation（会写入 localStorage），Step5 explain 才能自动生成。
        </div>
      ) : null}
    </section>
  );
}
