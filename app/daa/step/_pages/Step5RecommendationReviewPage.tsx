"use client";

import { RebalanceSimulatePanel } from "../_components/RebalanceSimulatePanel";

const SAMPLE_REBALANCE_SIMULATE_REQUEST = {
  money_plan: {
    account: {
      baseCcy: "USD",
      totalEquity: 10000,
      cash: 2500,
      investable: 8000,
    },
    constraints: {
      maxPositionPct: 0.2,
      maxIn: 1200,
      maxOut: 1200,
    },
    allocations: [
      { id: "SPY", label: "US Equity (SPY)", targetPct: 0.6, tags: { riskPreference: "mid" } },
      { id: "TLT", label: "US Bonds (TLT)", targetPct: 0.4, tags: { riskPreference: "low" } },
    ],
  },
  signals: [
    { symbol: "SPY", action: "BUY", score: 0.82, reason: "trend up" },
    { symbol: "TLT", action: "HOLD", score: 0.55, reason: "neutral" },
  ],
};

/**
 * Step5 v0 — 推荐结果展示（Recommendation Review）
 *
 * For v0 milestone, we keep this page as a second entry point to generate and inspect
 * the rebalance recommendation (orders + explain) and copy raw JSON.
 */
export default function Step5RecommendationReviewPage() {
  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 5 — 推荐结果展示（Recommendation Review）v0 (rebalance-simulate-ui)</h1>
      <p style={{ color: "#444" }}>
        v0：同样调用 <code>POST /api/daa/rebalance/simulate</code>，展示推荐动作（orders）、目标权重（allocations）、
        以及 explain/warnings，并提供一键复制 JSON。
        <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}>(rebalance-simulate-ui)</span>
      </p>

      <RebalanceSimulatePanel title="Generate & inspect recommendation" defaultRequest={SAMPLE_REBALANCE_SIMULATE_REQUEST} />
    </main>
  );
}
