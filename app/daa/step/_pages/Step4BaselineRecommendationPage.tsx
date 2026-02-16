"use client";

import {
  DAA_FUNDS_HUB_RUN_RECOMMENDATION_DONE_EVENT,
  DAA_FUNDS_HUB_RUN_RECOMMENDATION_EVENT,
  LS_REBALANCE_CORE_REQUEST,
  LS_REBALANCE_CORE_RESPONSE,
} from "../../wizardStorage";

import { RebalanceSimulatePanel } from "../_components/RebalanceSimulatePanel";

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
  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 4 — 基准算法推荐（v0）</h1>
      <p style={{ color: "#444" }}>
        v0：点击按钮调用 <code>POST /api/daa/rebalance/simulate</code> 生成“再平衡推荐”（orders + target weights + explain），并提供一键复制 JSON。
        不真下单；可选将 orders 记录到本地 execution log（paper）用于回溯（仅写 localStorage）。
      </p>

      <div style={{ marginTop: 12 }}>
        <RebalanceSimulatePanel
          title="Generate v0 baseline recommendation"
          fixtureEndpoint="/api/daa/fixtures/rebalance-simulate-request-v0"
          includeMarketContext
          runTriggerEvent={DAA_FUNDS_HUB_RUN_RECOMMENDATION_EVENT}
          runTriggerDoneEvent={DAA_FUNDS_HUB_RUN_RECOMMENDATION_DONE_EVENT}
        />
      </div>

      <h2 style={{ marginTop: 20, fontSize: 16 }}>Rebalance core (holdings/prices/targetWeights) v0</h2>
      <p style={{ color: "#444" }}>
        v0：提供一个更底层的“再平衡核心”入口：输入当前持仓/价格/目标权重，输出 orders + targetWeights，并可复制 JSON。
        API: <code>POST /api/daa/rebalance/core</code>（纯 TS 实现，用于快速迭代/CI 验证）。
      </p>

      <div style={{ marginTop: 12 }}>
        <RebalanceSimulatePanel
          title="Compute v0 rebalance (core)"
          fixtureEndpoint="/api/daa/fixtures/rebalance-core-request-v0"
          endpoints={["/api/daa/rebalance/core", "/daa/api/daa/rebalance/core"]}
          includeMarketContext
          storageKeyRequest={LS_REBALANCE_CORE_REQUEST}
          storageKeyResponse={LS_REBALANCE_CORE_RESPONSE}
        />
      </div>
    </main>
  );
}
