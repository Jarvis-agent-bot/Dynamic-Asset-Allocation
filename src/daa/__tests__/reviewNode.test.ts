import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CognitiveState } from "@/src/daa/agent/cognitiveState";
import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";

vi.mock("@/src/daa/modules/marketCache/priceSeriesCache", () => ({
  fetchPriceSeriesWithCache: vi.fn(async () => ({
    symbol: "AMD",
    source: "db",
    data: [
      { date: "2026-04-29", close: 100 },
      { date: "2026-05-14", close: 110 },
    ],
  })),
}));

vi.mock("@/src/daa/agent/store/thesisStore", () => ({
  getDueReviews: vi.fn(),
  createThesisReview: vi.fn(async () => undefined),
  updateThesis: vi.fn(async () => undefined),
}));

vi.mock("@/src/daa/agent/helpers/llm", () => ({
  callDeepSeekJson: vi.fn(async () => ({
    data: {
      actualOutcome: "价格上涨，论点部分兑现",
      accuracyScore: 75,
      lesson: null,
      shouldInvalidate: false,
      shouldArchive: false,
    },
    tokensUsed: 120,
  })),
}));

vi.mock("@/src/daa/agent/embedding", () => ({
  generateEmbedding: vi.fn(async () => []),
}));

vi.mock("@/src/daa/agent/store/memoryStore", () => ({
  createMemory: vi.fn(async () => undefined),
}));

import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { reviewNode } from "@/src/daa/agent/nodes/reviewNode";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";

function buildThread(overrides?: Partial<ResearchThread>): ResearchThread {
  return {
    id: "thread_1",
    title: "AMD AI GPU thesis",
    status: "active",
    thesisText: "AMD 数据中心增长会改善盈利。",
    conviction: "medium",
    invalidationConditions: null,
    reviewAt: "2026-05-14T00:00:00.000Z",
    assetKeys: ["US::AMD"],
    tags: ["semiconductor"],
    priorityScore: 0.8,
    createdAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("reviewNode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T00:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("使用 ISO 起始日期读取价格缓存，而不是把 15d 传给 DB date 参数", async () => {
    vi.mocked(thesisStore.getDueReviews).mockResolvedValue([buildThread()]);

    await reviewNode({
      errors: [],
      market: { regime: "transitional", vix: null, indicators: {} },
      agentConfig: { enabled: true, maxInvestigationTargets: 3, reviewIntervalDays: 30, memoryRecallLimit: 5, circuitBreakerThreshold: 3 },
    } as unknown as CognitiveState);

    expect(vi.mocked(fetchPriceSeriesWithCache)).toHaveBeenCalledWith("AMD", "2026-04-29");
  });
});
