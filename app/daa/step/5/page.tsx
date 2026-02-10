"use client";

import { useState } from "react";

import Step5RecommendationReviewPage from "../_pages/Step5RecommendationReviewPage";
import Step5SignalDecisionSummaryPage from "../_pages/Step5SignalDecisionSummaryPage";

type TabKey = "recommendation" | "signal_summary";

export default function Step5Page() {
  const [tab, setTab] = useState<TabKey>("recommendation");

  return (
    <main>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setTab("recommendation")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e5e5",
            background: tab === "recommendation" ? "#111" : "#fafafa",
            color: tab === "recommendation" ? "#fff" : "#111",
            fontSize: 12,
          }}
        >
          Recommendation Review
        </button>
        <button
          type="button"
          onClick={() => setTab("signal_summary")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e5e5",
            background: tab === "signal_summary" ? "#111" : "#fafafa",
            color: tab === "signal_summary" ? "#fff" : "#111",
            fontSize: 12,
          }}
        >
          Signal Decision Summary
        </button>
      </div>

      <div style={{ marginTop: 12 }}>{tab === "recommendation" ? <Step5RecommendationReviewPage /> : <Step5SignalDecisionSummaryPage />}</div>
    </main>
  );
}
