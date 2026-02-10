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
 * Step4 v0 — 基准再平衡（Baseline Rebalance）
 *
 * Goal (v0 milestone): expose a visible user action that calls POST /api/daa/rebalance/simulate
 * and renders recommended actions/target weights + explanation + copyable JSON.
 */
export default function Step4BaselineRebalancePage() {
  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准再平衡（Baseline Rebalance）v0 (rebalance-simulate-ui)</h1>
      <p style={{ color: "#444" }}>
        v0：点击按钮调用 <code>POST /api/daa/rebalance/simulate</code> 生成“再平衡推荐”（orders + target weights + explain），并提供一键复制 JSON。
        默认提供一份已知可用的 sample payload，避免默认 422。
      </p>

      <RebalanceSimulatePanel
        title="Generate v0 rebalance recommendation"
        defaultRequest={SAMPLE_REBALANCE_SIMULATE_REQUEST}
      />
    </main>
  );
}
