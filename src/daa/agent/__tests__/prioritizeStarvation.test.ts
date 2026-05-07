/**
 * prioritizeNode — Starvation prevention 单测。
 *
 * 验证修复点：medium+ conviction thesis 超过 staleness 阈值（默认 7 天）未调查时，
 * 必须被强制注入调查队列，覆盖 LLM 偏好新建 uncertain thesis 的选择。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CognitiveState } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, ResearchThread } from "@/src/daa/agent/cognitiveTypes";

vi.mock("@/src/daa/agent/store/thesisStore", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/agent/store/thesisStore")>(
    "@/src/daa/agent/store/thesisStore",
  );
  return {
    ...actual,
    getThesisAccuracyAvg: vi.fn(async () => null),
    findSimilarThesis: vi.fn(async () => null),
    createResearchThread: vi.fn(),
    getThesisById: vi.fn(async (id: string) => ({
      id,
      title: `thread-${id}`,
      status: "active",
      thesisText: "",
      conviction: "uncertain",
      invalidationConditions: null,
      reviewAt: null,
      assetKeys: [],
      tags: [],
      priorityScore: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ResearchThread)),
  };
});

vi.mock("@/src/daa/agent/helpers/llm", () => ({
  callDeepSeekJson: vi.fn(),
}));

vi.mock("@/src/daa/agent/learning/strategyStore", () => ({
  findMatchingStrategies: vi.fn(async () => []),
}));

function makeThesis(over: Partial<ResearchThread>): ResearchThread {
  return {
    id: "t-default",
    title: "default thesis",
    status: "active",
    thesisText: "",
    conviction: "uncertain",
    invalidationConditions: null,
    reviewAt: null,
    assetKeys: [],
    tags: [],
    priorityScore: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

function makeState(overrides: Partial<CognitiveState>): CognitiveState {
  return {
    portfolio: { holdings: [], totalEquity: 0, cashPct: 1 },
    market: { regime: "risk_on", vix: null, indicators: {} },
    news: { items: [] },
    activeTheses: [],
    investigationQueue: [],
    currentTarget: null,
    currentThread: null,
    newThreadSuggestions: [],
    investigateResult: null,
    retrievedMemories: [],
    subAgentResults: [],
    matchedStrategies: [],
    surprises: [],
    briefing: null,
    reasoningTraces: [],
    toolsCalled: [],
    thesesUpdated: 0,
    memoriesCreated: 0,
    totalTokens: 0,
    agentConfig: {
      enabled: true,
      maxInvestigationTargets: 3,
      reviewIntervalDays: 14,
      memoryRecallLimit: 5,
      circuitBreakerThreshold: 3,
      schedule: "2x_daily",
      memoryDecayRate: 0.97,
      thesisStalenessDays: 7,
    },
    errors: [],
    ...overrides,
  } as CognitiveState;
}

describe("prioritizeNode starvation prevention", () => {
  beforeEach(async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    const thesisStore = await import("@/src/daa/agent/store/thesisStore");
    vi.mocked(callDeepSeekJson).mockReset();
    vi.mocked(thesisStore.getThesisById).mockClear();
  });

  it("把 LLM 返回的 8 位短 id 归一成完整 thread id", async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    const thesisStore = await import("@/src/daa/agent/store/thesisStore");
    const fullId = "de08afe3-7056-4a5c-84a8-8377afbcd9fa";
    vi.mocked(callDeepSeekJson).mockResolvedValue({
      data: {
        targets: [{ threadId: "de08afe3", reason: "LLM returned short id", dataNeeded: ["news"] }],
        newThreads: [],
      },
      tokensUsed: 100,
    });

    const state = makeState({
      activeTheses: [
        makeThesis({ id: fullId, conviction: "uncertain", assetKeys: ["US::NVDA"], updatedAt: new Date().toISOString() }),
      ],
    });

    const { prioritizeNode } = await import("@/src/daa/agent/nodes/prioritizeNode");
    const result = await prioritizeNode(state);

    const currentTarget = result.currentTarget as InvestigationTarget | null;
    expect(currentTarget?.threadId).toBe(fullId);
    expect(vi.mocked(thesisStore.getThesisById)).toHaveBeenCalledWith(fullId);
  });

  it("注入 9 天未调查的 medium thesis 到队列", async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    // LLM 只选 uncertain 调查型 thesis，完全忽略 medium
    vi.mocked(callDeepSeekJson).mockResolvedValue({
      data: {
        targets: [
          { threadId: "u1", reason: "new uncertain", dataNeeded: [] },
          { threadId: "u2", reason: "another uncertain", dataNeeded: [] },
          { threadId: "u3", reason: "third uncertain", dataNeeded: [] },
        ],
        newThreads: [],
      },
      tokensUsed: 100,
    });

    const nineDaysAgo = new Date(Date.now() - 9 * 86400000).toISOString();
    const today = new Date().toISOString();
    const state = makeState({
      activeTheses: [
        makeThesis({ id: "u1", conviction: "uncertain", updatedAt: today }),
        makeThesis({ id: "u2", conviction: "uncertain", updatedAt: today }),
        makeThesis({ id: "u3", conviction: "uncertain", updatedAt: today }),
        makeThesis({ id: "m1", conviction: "medium", title: "看多NVDA", updatedAt: nineDaysAgo }),
      ],
    });

    const { prioritizeNode } = await import("@/src/daa/agent/nodes/prioritizeNode");
    const result = await prioritizeNode(state);

    const queue = (result.investigationQueue ?? []) as Array<{ threadId: string | null }>;
    const queueIds = queue.map(t => t.threadId);
    expect(queueIds).toContain("m1");
    // 应该挤掉一个 uncertain（maxTargets=3 已满）
    expect(result.investigationQueue).toHaveLength(3);
  });

  it("有多个 stale medium+ 时选最旧的", async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    vi.mocked(callDeepSeekJson).mockResolvedValue({
      data: {
        targets: [{ threadId: "u1", reason: "", dataNeeded: [] }],
        newThreads: [],
      },
      tokensUsed: 100,
    });

    const state = makeState({
      activeTheses: [
        makeThesis({ id: "u1", conviction: "uncertain", updatedAt: new Date().toISOString() }),
        makeThesis({ id: "m_newer", conviction: "medium", updatedAt: new Date(Date.now() - 8 * 86400000).toISOString() }),
        makeThesis({ id: "m_older", conviction: "medium", updatedAt: new Date(Date.now() - 15 * 86400000).toISOString() }),
        makeThesis({ id: "h_oldest", conviction: "high", updatedAt: new Date(Date.now() - 20 * 86400000).toISOString() }),
      ],
    });

    const { prioritizeNode } = await import("@/src/daa/agent/nodes/prioritizeNode");
    const result = await prioritizeNode(state);

    const queue = (result.investigationQueue ?? []) as Array<{ threadId: string | null }>;
    const queueIds = queue.map(t => t.threadId);
    expect(queueIds).toEqual(["h_oldest", "m_older", "m_newer"]); // 按最旧优先轮询填满槽位
  });

  it("medium thesis 未超阈值时不注入", async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    vi.mocked(callDeepSeekJson).mockResolvedValue({
      data: {
        targets: [{ threadId: "u1", reason: "", dataNeeded: [] }],
        newThreads: [],
      },
      tokensUsed: 100,
    });

    const state = makeState({
      activeTheses: [
        makeThesis({ id: "u1", conviction: "uncertain", updatedAt: new Date().toISOString() }),
        // 5 天前，小于默认 7 天阈值
        makeThesis({ id: "m_fresh", conviction: "medium", updatedAt: new Date(Date.now() - 5 * 86400000).toISOString() }),
      ],
    });

    const { prioritizeNode } = await import("@/src/daa/agent/nodes/prioritizeNode");
    const result = await prioritizeNode(state);

    const queue = (result.investigationQueue ?? []) as Array<{ threadId: string | null }>;
    const queueIds = queue.map(t => t.threadId);
    expect(queueIds).not.toContain("m_fresh");
    expect(queueIds).toEqual(["u1"]);
  });

  it("LLM 已选 stale medium 时不重复注入", async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    vi.mocked(callDeepSeekJson).mockResolvedValue({
      data: {
        targets: [
          { threadId: "m1", reason: "LLM 选了", dataNeeded: [] },
          { threadId: "u1", reason: "", dataNeeded: [] },
        ],
        newThreads: [],
      },
      tokensUsed: 100,
    });

    const state = makeState({
      activeTheses: [
        makeThesis({ id: "u1", conviction: "uncertain", updatedAt: new Date().toISOString() }),
        makeThesis({ id: "m1", conviction: "medium", updatedAt: new Date(Date.now() - 10 * 86400000).toISOString() }),
      ],
    });

    const { prioritizeNode } = await import("@/src/daa/agent/nodes/prioritizeNode");
    const result = await prioritizeNode(state);

    const queue = (result.investigationQueue ?? []) as Array<{ threadId: string | null }>;
    const queueIds = queue.map(t => t.threadId);
    const m1Count = queueIds.filter(id => id === "m1").length;
    expect(m1Count).toBe(1); // 只出现一次
  });

  it("队列未满时直接追加而不挤占", async () => {
    const { callDeepSeekJson } = await import("@/src/daa/agent/helpers/llm");
    vi.mocked(callDeepSeekJson).mockResolvedValue({
      data: {
        targets: [{ threadId: "u1", reason: "", dataNeeded: [] }],
        newThreads: [],
      },
      tokensUsed: 100,
    });

    const state = makeState({
      activeTheses: [
        makeThesis({ id: "u1", conviction: "uncertain", updatedAt: new Date().toISOString() }),
        makeThesis({ id: "m1", conviction: "medium", updatedAt: new Date(Date.now() - 10 * 86400000).toISOString() }),
      ],
    });

    const { prioritizeNode } = await import("@/src/daa/agent/nodes/prioritizeNode");
    const result = await prioritizeNode(state);

    const queue = (result.investigationQueue ?? []) as Array<{ threadId: string | null }>;
    expect(queue).toHaveLength(2);
    expect(queue.map(t => t.threadId)).toEqual(["m1", "u1"]);
  });
});
