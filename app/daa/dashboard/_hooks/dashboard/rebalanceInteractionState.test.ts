import { describe, expect, it } from "vitest";

import {
  deriveRebalanceInteractionState,
  type RebalanceInteractionStage,
} from "./rebalanceInteractionState";
import type {
  AssetUniverseView,
  PreTradeRiskCheck,
  RebalanceCycle,
} from "@/src/daa/modules/workbench/workbenchTypes";

function makeAssetRow(overrides?: Partial<AssetUniverseView>): AssetUniverseView {
  return {
    assetKey: "US:AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    watchEnabled: true,
    holdingQty: 10,
    targetWeightHint: 0.1,
    ...overrides,
  } as AssetUniverseView;
}

function makeRiskCheck(overrides?: Partial<PreTradeRiskCheck>): PreTradeRiskCheck {
  return {
    overallStatus: "pass",
    items: [],
    ...overrides,
  } as PreTradeRiskCheck;
}

function makeCycle(overrides?: Partial<RebalanceCycle>): RebalanceCycle {
  return {
    cycleId: "cycle-001",
    status: "generated",
    triggerSource: "manual",
    proposals: [
      {
        assetKey: "US:AAPL",
        symbol: "AAPL",
        currency: "USD",
        side: "BUY",
        selected: true,
        suggestedQty: 1,
        suggestedNotional: 100,
        price: 100,
        reason: "测试",
      },
    ],
    riskCheck: makeRiskCheck(),
    ...overrides,
  } as RebalanceCycle;
}

describe("deriveRebalanceInteractionState", () => {
  it.each([
    ["empty", null, null, false],
    ["review", makeCycle({ riskCheck: makeRiskCheck({ overallStatus: "pass" }) }), null, false],
    ["risk_blocked", makeCycle(), makeRiskCheck({ overallStatus: "block" }), false],
    ["executable", makeCycle(), makeRiskCheck({ overallStatus: "pass" }), false],
    ["executing", makeCycle({ status: "executing" }), makeRiskCheck({ overallStatus: "pass" }), false],
    ["completed", makeCycle({ status: "completed" }), makeRiskCheck({ overallStatus: "pass" }), false],
    ["cancelled", makeCycle({ status: "cancelled" }), makeRiskCheck({ overallStatus: "pass" }), false],
    ["busy", makeCycle(), makeRiskCheck({ overallStatus: "pass" }), true],
  ] satisfies Array<[RebalanceInteractionStage, RebalanceCycle | null, PreTradeRiskCheck | null, boolean]>)(
    "returns %s stage",
    (stage, cycle, riskCheck, busy) => {
      expect(deriveRebalanceInteractionState({
        assetRows: [makeAssetRow()],
        currentCycle: cycle,
        riskCheck,
        busy,
      }).stage).toBe(stage);
    },
  );

  it("requires a non-blocking risk check before execution", () => {
    const state = deriveRebalanceInteractionState({
      assetRows: [makeAssetRow()],
      currentCycle: makeCycle({ riskCheck: makeRiskCheck({ overallStatus: "pass" }) }),
      riskCheck: null,
      busy: false,
    });

    expect(state.stage).toBe("review");
    expect(state.canExecuteAll).toBe(false);
    expect(state.canExecuteSelected).toBe(false);
    expect(state.firstBlockedActionReason).toBe("请先运行风控校验后再执行。");
  });

  it("keeps proposal selection and checklist derivations in the same state object", () => {
    const state = deriveRebalanceInteractionState({
      assetRows: [
        makeAssetRow({ assetKey: "US:AAPL", watchEnabled: true, holdingQty: 10, targetWeightHint: 0.1 }),
        makeAssetRow({ assetKey: "US:MSFT", watchEnabled: true, holdingQty: 0, targetWeightHint: 0 }),
      ],
      currentCycle: makeCycle({
        proposals: [
          { assetKey: "US:AAPL", symbol: "AAPL", currency: "USD", side: "BUY", selected: true, suggestedQty: 1, suggestedNotional: 100, price: 100, reason: "测试" } as never,
          { assetKey: "US:MSFT", symbol: "MSFT", currency: "USD", side: "SELL", selected: false, suggestedQty: 1, suggestedNotional: 50, price: 50, reason: "测试" } as never,
        ],
      }),
      riskCheck: makeRiskCheck({ overallStatus: "warn" }),
      busy: false,
    });

    expect(state.stage).toBe("executable");
    expect(state.summary).toEqual({ holdingAssets: 1, watchlistAssets: 2 });
    expect(state.selectedProposalCount).toBe(1);
    expect(state.selectedProposalNotional).toBe(100);
    expect(state.buyProposalCount).toBe(1);
    expect(state.sellProposalCount).toBe(1);
    expect(state.rebalanceChecklistAllPassed).toBe(true);
  });
});
