import { describe, expect, it } from "vitest";

import {
  evaluateAutoRebalanceAuthority,
  evaluateBrainActionAuthority,
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
    }).toMatchInlineSnapshot(`
      {
        "autoRebalance": {
          "allowed": true,
          "checks": [
            {
              "id": "brain-mode-simulate-rebalance",
              "message": "自动驾驶模式允许「执行模拟调仓」。",
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
                "message": "自动驾驶模式允许「运行认知循环」。",
                "passed": true,
              },
            ],
            "reason": "自动执行授权通过。",
            "requiresConfirmation": false,
          },
          "simulateRebalance": {
            "allowed": true,
            "checks": [
              {
                "id": "brain-mode-action",
                "message": "自动驾驶模式允许「执行模拟调仓」。",
                "passed": true,
              },
            ],
            "reason": "自动执行授权通过。",
            "requiresConfirmation": false,
          },
        },
      }
    `);
  });

  it("advisor 模式和远端执行网关会阻止自动执行", () => {
    const config = normalizeSystemConfig({
      brain: { mode: "advisor" },
      rebalanceStrategy: {
        autoGenerateEnabled: true,
        autoExecuteEnabled: true,
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
            "message": "顾问模式下未开放「执行模拟调仓」。",
            "passed": false,
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
        "reason": "顾问模式下未开放「执行模拟调仓」。",
        "requiresConfirmation": false,
      }
    `);
  });
});
