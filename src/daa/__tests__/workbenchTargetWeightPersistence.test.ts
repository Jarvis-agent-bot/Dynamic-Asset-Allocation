import { describe, expect, it } from "vitest";

import {
  buildExecutedTargetWeightPatches,
  type ExecutedTargetWeightPatch,
} from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

function patchMap(patches: ExecutedTargetWeightPatch[]): Record<string, number> {
  return Object.fromEntries(patches.map((row) => [row.assetKey, row.targetWeightHint]));
}

describe("buildExecutedTargetWeightPatches", () => {
  it("Agent 目标权重成交后优先写回持久目标", () => {
    const patches = buildExecutedTargetWeightPatches({
      cycle: {
        agentDecisionSnapshot: {
          targetWeightOverrides: {
            "US::NVDA": 0.08,
            "US::QQQ": 0,
          },
        },
        proposals: [
          {
            assetKey: "US::NVDA",
            symbol: "NVDA",
            currency: "USD",
            fxRateToBase: 1,
            side: "BUY",
            suggestedQty: 1,
            suggestedNotional: 100,
            price: 100,
            reason: "Agent 目标建仓",
            selected: true,
            hfContribution: null,
            targetWeightPct: 5,
          },
        ],
      },
      cycleLogs: [
        { assetKey: "US::NVDA", status: "executed" },
        { assetKey: "US::QQQ", status: "rejected" },
      ],
    });

    expect(patchMap(patches)).toEqual({ "US::NVDA": 0.08 });
    expect(patches[0]?.reason).toBe("agent_target");
  });

  it("观察列表自动建仓成交后用 proposal 目标权重补写持久目标", () => {
    const patches = buildExecutedTargetWeightPatches({
      cycle: {
        agentDecisionSnapshot: null,
        proposals: [
          {
            assetKey: "US::SPY",
            symbol: "SPY",
            currency: "USD",
            fxRateToBase: 1,
            side: "BUY",
            suggestedQty: 1,
            suggestedNotional: 500,
            price: 500,
            reason: "观察列表自动建仓 tech=80 val=70 fusion=75 目标 5.0%",
            selected: true,
            hfContribution: null,
            targetWeightPct: 5,
            proposalType: "watchlist_entry",
          },
        ],
      },
      cycleLogs: [{ assetKey: "US::SPY", status: "executed" }],
    });

    expect(patchMap(patches)).toEqual({ "US::SPY": 0.05 });
    expect(patches[0]?.reason).toBe("proposal_target");
  });
});
