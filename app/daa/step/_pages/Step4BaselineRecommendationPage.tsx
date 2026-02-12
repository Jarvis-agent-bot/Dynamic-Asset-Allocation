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

const SAMPLE_REBALANCE_CORE_REQUEST = {
  account: {
    baseCcy: "USD",
    cash: 0,
  },
  constraints: {
    maxPositionPct: 0.6,
    maxIn: 500,
    maxOut: 500,
    minNotional: 0.01,
  },
  // v0 trigger policy: avoid over-trading on tiny drifts and add a debounce window.
  policy: {
    thresholdPct: 0.01,
    minTradeNotional: 10,
    cooldownSeconds: 10 * 60,
  },
  holdings: [
    { symbol: "SPY", qty: 10 },
    { symbol: "TLT", qty: 10 },
  ],
  prices: [
    { symbol: "SPY", price: 100 },
    { symbol: "TLT", price: 100 },
    { symbol: "GLD", price: 100 },
  ],
  targetWeights: [
    { id: "SPY", label: "SPY", targetPct: 0.5 },
    { id: "TLT", label: "TLT", targetPct: 0.25 },
    { id: "GLD", label: "GLD", targetPct: 0.25 },
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
  // Keep samples stable across renders.
  const defaultSimRequest = useMemo(() => SAMPLE_REBALANCE_SIMULATE_REQUEST, []);
  const defaultCoreRequest = useMemo(() => SAMPLE_REBALANCE_CORE_REQUEST, []);

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准算法推荐（v0）</h1>
      <p style={{ color: "#444" }}>
        v0：点击按钮调用 <code>POST /api/daa/rebalance/simulate</code> 生成“再平衡推荐”（orders + target weights + explain），并提供一键复制 JSON。
        不接 AI，不做交易执行（仅供决策参考）。
      </p>

      <div style={{ marginTop: 12 }}>
        <RebalanceSimulatePanel title="Generate v0 baseline recommendation" defaultRequest={defaultSimRequest} includeMarketContext />
      </div>

      <h2 style={{ marginTop: 20, fontSize: 16 }}>Rebalance core (holdings/prices/targetWeights) v0</h2>
      <p style={{ color: "#444" }}>
        v0：提供一个更底层的“再平衡核心”入口：输入当前持仓/价格/目标权重，输出 orders + targetWeights，并可复制 JSON。
        API: <code>POST /api/daa/rebalance/core</code>（纯 TS 实现，用于快速迭代/CI 验证）。
      </p>

      <div style={{ marginTop: 12 }}>
        <RebalanceSimulatePanel
          title="Compute v0 rebalance (core)"
          defaultRequest={defaultCoreRequest}
          endpoints={["/api/daa/rebalance/core", "/daa/api/daa/rebalance/core"]}
          includeMarketContext
        />
      </div>
    </main>
  );
}
