import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/daaStorePg", async () => {
  const { buildSystemConfigRow } = await import("@/src/daa/__tests__/testDataFactories");
  return {
    getDaaSystemConfig: vi.fn(async () => buildSystemConfigRow({
      policy: {
        review: {
          timezone: "Asia/Shanghai",
        },
      },
    })),
  };
});

vi.mock("@/src/daa/agent/autopilotOrchestrator", () => ({
  runAutopilotLoop: vi.fn(async () => ({
    skipped: false,
    reason: null,
    cognitiveRun: { runId: "agent-run-risk-1" },
    rebalance: {
      cycleId: null,
      proposalCount: 0,
      reason: null,
    },
  })),
}));

vi.mock("@/src/daa/cron/accountCronScope", async (importActual) => {
  const actual = await importActual<typeof import("@/src/daa/cron/accountCronScope")>();
  return {
    ...actual,
    runIdempotentAccountScopedCronJob: vi.fn(async (input: {
      idempotencyKey: string | null;
      handler: (context: { jobId: string; requestId: string; startedAt: string }) => Promise<Record<string, unknown>>;
    }) => {
      const result = await input.handler({
        jobId: "risk-agent-job-1",
        requestId: "risk-agent-request-1",
        startedAt: "2026-06-20T00:00:00.000Z",
      });
      return {
        ...result,
        jobId: "risk-agent-job-1",
        requestId: "risk-agent-request-1",
        durationMs: 1,
        idempotencyKey: input.idempotencyKey,
      };
    }),
  };
});

import {
  buildRiskAutopilotDailyKey,
  runRiskAutopilotDaily,
} from "@/src/daa/automation/riskAutopilotTrigger";
import { runIdempotentAccountScopedCronJob } from "@/src/daa/cron/accountCronScope";
import { withDaaAccountScope } from "@/src/daa/account/accountScope";

describe("riskAutopilotTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("按账号时区日期和风险触发项生成稳定幂等 key", () => {
    const now = new Date("2026-06-19T17:30:00.000Z");
    const first = buildRiskAutopilotDailyKey({
      now,
      timeZone: "Asia/Shanghai",
      triggers: [
        { symbol: "MU", triggerType: "take_profit" },
        { symbol: "ETH-USD", triggerType: "stop_loss" },
      ],
    });
    const reordered = buildRiskAutopilotDailyKey({
      now,
      timeZone: "Asia/Shanghai",
      triggers: [
        { symbol: "eth-usd", triggerType: "stop_loss" },
        { symbol: "mu", triggerType: "take_profit" },
      ],
    });
    const changed = buildRiskAutopilotDailyKey({
      now,
      timeZone: "Asia/Shanghai",
      triggers: [
        { symbol: "MU", triggerType: "take_profit" },
      ],
    });

    expect(first).toBe(reordered);
    expect(first).toMatch(/^cron_risk_autopilot:2026-06-20:/);
    expect(changed).not.toBe(first);
  });

  it("风险复核幂等 key 带当前账号 scope，避免多账号互相抢锁", async () => {
    const result = await withDaaAccountScope("account-b", () =>
      runRiskAutopilotDaily({
        req: new Request("http://localhost/api/daa/cron/drift-check", { method: "POST" }),
        source: "cron_drift_check",
        reason: "止盈止损触发即时审核",
        triggers: [
          { symbol: "ETH-USD", triggerType: "stop_loss" },
          { symbol: "MU", triggerType: "take_profit" },
        ],
      }),
    );

    const input = vi.mocked(runIdempotentAccountScopedCronJob).mock.calls[0]?.[0];
    expect(input?.idempotencyKey).toMatch(/^account-b:cron_risk_autopilot:2026-/);
    expect(result.idempotencyKey).toBe(input?.idempotencyKey);
  });
});
