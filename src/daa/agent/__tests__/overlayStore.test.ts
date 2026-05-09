import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
}));

vi.mock("@/src/daa/account/accountScope", () => ({
  getDaaAccountScopeId: () => "acct-1",
}));

import { getAgentStrategyOverlayForRun } from "@/src/daa/agent/store/overlayStore";

describe("getAgentStrategyOverlayForRun", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("空 runId 不查询数据库", async () => {
    await expect(getAgentStrategyOverlayForRun(" ")).resolves.toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("读取 briefing.strategyOverlay 并归一化 intents", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        briefing: JSON.stringify({
          strategyOverlay: {
            generatedAt: "2026-05-09T00:00:00.000Z",
            agentRunId: "run-1",
            regimeOverride: null,
            targetAllocationPlan: {
              reasoning: "LLM 返回了非数组 intents",
              intents: null,
            },
          },
        }),
      }],
    });

    const overlay = await getAgentStrategyOverlayForRun("run-1");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("FROM daa_agent_runs"), ["acct-1", "run-1"]);
    expect(overlay?.agentRunId).toBe("run-1");
    expect(overlay?.targetAllocationPlan?.intents).toEqual([]);
  });
});
