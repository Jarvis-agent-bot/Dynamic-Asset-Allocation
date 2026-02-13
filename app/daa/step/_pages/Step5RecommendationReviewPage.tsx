"use client";

import { RebalanceSimulatePanel } from "../_components/RebalanceSimulatePanel";

/**
 * Step5 v0 — 推荐结果展示（Recommendation Review）
 *
 * For v0 milestone, we keep this page as a second entry point to generate and inspect
 * the rebalance recommendation (orders + explain) and copy raw JSON.
 */
export default function Step5RecommendationReviewPage() {
  return (
    <section>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 5 — 推荐结果展示（Recommendation Review）v0 (rebalance-simulate-ui)</h1>
      <p style={{ color: "#444" }}>
        v0：同样调用 <code>POST /api/daa/rebalance/simulate</code>，展示推荐动作（orders）、目标权重（allocations）、以及 explain/warnings，并提供一键复制 JSON。
        <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}>(rebalance-simulate-ui)</span>
      </p>

      <RebalanceSimulatePanel
        title="Generate & inspect recommendation"
        fixtureEndpoint="/api/daa/fixtures/rebalance-simulate-request-v0"
      />
    </section>
  );
}
