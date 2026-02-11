"use client";

import { useMemo } from "react";

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
 * Step4 v0 — 基准算法推荐（baseline recommendation）
 *
 * v0 goal: call `POST /api/daa/rebalance/simulate` and show:
 * - orders (actions)
 * - target weights
 * - explain/warnings
 * with copyable raw JSON.
 */
export default function Step4BaselineRecommendationPage() {
  // Keep the sample stable across renders.
  const defaultRequest = useMemo(() => SAMPLE_REBALANCE_SIMULATE_REQUEST, []);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准算法推荐（v0）</h1>
      <p style={{ color: "#444" }}>
        v0：点击按钮调用 <code>POST /api/daa/rebalance/simulate</code> 生成“再平衡推荐”（orders + target weights + explain），并提供一键复制 JSON。
        不接 AI，不做交易执行（仅供决策参考）。
      </p>

      <div style={{ marginTop: 12 }}>
        <RebalanceSimulatePanel title="Generate v0 baseline recommendation" defaultRequest={defaultRequest} includeMarketContext />
      </div>
    </main>
  );
}
