import { describe, expect, it } from "vitest";

import {
  evaluateAutoRebalanceAuthority,
  evaluateBrainActionAuthority,
  evaluateManualRebalanceAuthority,
} from "@/src/daa/automation/automationAuthority";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("automation-authority snapshots", () => {
  it("默认自动执行权限矩阵保持可快照追踪", () => {
    const config = normalizeSystemConfig({});

    expect({
      brain: {
        runAgent: evaluateBrainActionAuthority({ systemConfig: config, action: "run_agent_cycle" }),
        simulateRebalance: evaluateBrainActionAuthority({ systemConfig: config, action: "simulate_rebalance" }),
      },
      autoRebalance: evaluateAutoRebalanceAuthority({
        systemConfig: config,
        triggerSource: "agent_trigger",
        cycleId: "cycle-1",
        proposalCount: 1,
        executionVenueMode: "local",
      }),
      manualRebalance: evaluateManualRebalanceAuthority({
        systemConfig: config,
        cycleId: "cycle-1",
        proposalCount: 1,
        executionVenueMode: "local",
      }),
    }).toMatchInlineSnapshot(`
      {
        "autoRebalance": {
          "allowed": true,
          "checks": [
            {
              "id": "brain-mode-simulate-rebalance",
              "message": "「自动复核」授权等级允许「执行模拟调仓」。",
              "passed": true,
            },
            {
              "id": "policy-enabled",
              "message": "策略引擎未开启，不能进入自动执行。",
              "passed": true,
            },
            {
              "id": "auto-generate-enabled",
              "message": "自动生成未开启，不能进入自动执行。",
              "passed": true,
            },
            {
              "id": "auto-execute-enabled",
              "message": "自动执行未开启。",
              "passed": true,
            },
            {
              "id": "local-execution-venue",
              "message": "自动执行仅允许本地模拟执行网关。",
              "passed": true,
            },
            {
              "id": "cycle-present",
              "message": "缺少可执行的再平衡周期。",
              "passed": true,
            },
            {
              "id": "proposal-present",
              "message": "没有可执行提案，跳过自动执行。",
              "passed": true,
            },
          ],
          "reason": "自动执行授权通过。",
          "requiresConfirmation": false,
        },
        "brain": {
          "runAgent": {
            "allowed": true,
            "checks": [
              {
                "id": "brain-mode-action",
                "message": "「自动复核」授权等级允许「运行投资复核」。",
                "passed": true,
              },
            ],
            "reason": "投资助理动作授权通过。",
            "requiresConfirmation": false,
          },
          "simulateRebalance": {
            "allowed": true,
            "checks": [
              {
                "id": "brain-mode-action",
                "message": "「自动复核」授权等级允许「执行模拟调仓」。",
                "passed": true,
              },
            ],
            "reason": "投资助理动作授权通过。",
            "requiresConfirmation": false,
          },
        },
        "manualRebalance": {
          "allowed": true,
          "checks": [
            {
              "id": "brain-mode-simulate-rebalance",
              "message": "「自动复核」授权等级允许「执行模拟调仓」。",
              "passed": true,
            },
            {
              "id": "local-execution-venue",
              "message": "手动调仓执行仅允许本地模拟执行网关。",
              "passed": true,
            },
            {
              "id": "cycle-present",
              "message": "缺少可执行的再平衡周期。",
              "passed": true,
            },
            {
              "id": "proposal-present",
              "message": "没有可执行提案，不能执行调仓。",
              "passed": true,
            },
          ],
          "reason": "手动执行授权通过。",
          "requiresConfirmation": false,
        },
      }
    `);
  });

  it("advisor 模式和远端执行网关会阻止自动执行", () => {
    const config = normalizeSystemConfig({
      brain: { mode: "advisor" },
      policy: {
        execution: {
          autoGenerateEnabled: true,
          autoExecuteEnabled: true,
        },
      },
    });

    expect(evaluateAutoRebalanceAuthority({
      systemConfig: config,
      triggerSource: "agent_trigger",
      cycleId: "cycle-1",
      proposalCount: 1,
      executionVenueMode: "remote",
    })).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "checks": [
          {
            "id": "brain-mode-simulate-rebalance",
            "message": "「仅建议」授权等级未开放「执行模拟调仓」。",
            "passed": false,
          },
          {
            "id": "policy-enabled",
            "message": "策略引擎未开启，不能进入自动执行。",
            "passed": true,
          },
          {
            "id": "auto-generate-enabled",
            "message": "自动生成未开启，不能进入自动执行。",
            "passed": true,
          },
          {
            "id": "auto-execute-enabled",
            "message": "自动执行未开启。",
            "passed": true,
          },
          {
            "id": "local-execution-venue",
            "message": "自动执行仅允许本地模拟执行网关。",
            "passed": false,
          },
          {
            "id": "cycle-present",
            "message": "缺少可执行的再平衡周期。",
            "passed": true,
          },
          {
            "id": "proposal-present",
            "message": "没有可执行提案，跳过自动执行。",
            "passed": true,
          },
        ],
        "reason": "「仅建议」授权等级未开放「执行模拟调仓」。",
        "requiresConfirmation": false,
      }
    `);
  });
});
