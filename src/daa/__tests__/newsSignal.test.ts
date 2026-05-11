import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/daaStorePg", () => ({
  upsertDaaNewsItemSnapshots: vi.fn().mockResolvedValue(0),
  upsertDaaNewsEventSnapshots: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  daaPgPool: vi.fn(),
}));

vi.mock("@/src/daa/signals/newsProviderRouter", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/signals/newsProviderRouter")>("@/src/daa/signals/newsProviderRouter");
  return {
    ...actual,
    fetchNewsForSymbol: vi.fn(),
  };
});

vi.mock("@/src/daa/signals/newsLlmAnalyzer", () => ({
  analyzeNewsWithLlm: vi.fn(),
}));

vi.mock("@/src/daa/modules/news-intelligence/newsIntelligenceService", () => ({
  refreshNewsIntelligenceForEvents: vi.fn().mockResolvedValue({
    eventGraphs: [],
    portfolioImpacts: [],
    discoveryCandidates: [],
  }),
}));

import { buildNewsSignalForSymbol } from "@/src/daa/signals/newsSignal";
import { analyzeNewsWithLlm } from "@/src/daa/signals/newsLlmAnalyzer";
import { fetchNewsForSymbol } from "@/src/daa/signals/newsProviderRouter";
import { daaPgPool } from "@/src/daa/pg/daaPg";
import { upsertDaaNewsEventSnapshots, upsertDaaNewsItemSnapshots } from "@/src/daa/store/daaStorePg";
import { refreshNewsIntelligenceForEvents } from "@/src/daa/modules/news-intelligence/newsIntelligenceService";

function titleHashSet(title: string): string {
  return createHash("sha1").update(title.toLowerCase().trim()).digest("hex").slice(0, 8);
}

function makeCachedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    score_pct: 64,
    confidence_pct: 72,
    evidence_count: 3,
    reasons_json: ["缓存摘要"],
    generated_at: new Date().toISOString(),
    item_hash_set: "cachedhash",
    llm_summary: "缓存里的新闻判断",
    llm_drivers_json: { bullish: ["订单改善"], bearish: [] },
    llm_major_event_json: { type: "earnings", impact: "high", description: "财报首次公布" },
    llm_action_hint: "关注",
    ...overrides,
  };
}

describe("newsSignal cache semantics", () => {
  const queryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    vi.mocked(daaPgPool).mockReturnValue({ query: queryMock } as unknown as ReturnType<typeof daaPgPool>);
    vi.mocked(upsertDaaNewsItemSnapshots).mockResolvedValue(0);
    vi.mocked(upsertDaaNewsEventSnapshots).mockResolvedValue(0);
  });

  it("抓取为空但有缓存时，只返回缓存，不刷新 signal 与 item_hash_set", async () => {
    queryMock.mockResolvedValueOnce({ rows: [makeCachedRow()] });
    vi.mocked(fetchNewsForSymbol).mockResolvedValue([]);

    const signal = await buildNewsSignalForSymbol("NVDA", "US");

    expect(signal?.llmSummary).toBe("缓存里的新闻判断");
    expect(signal?.evidenceCount).toBe(3);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analyzeNewsWithLlm)).not.toHaveBeenCalled();
    expect(vi.mocked(upsertDaaNewsItemSnapshots)).not.toHaveBeenCalled();
    expect(vi.mocked(upsertDaaNewsEventSnapshots)).not.toHaveBeenCalled();
    expect(vi.mocked(refreshNewsIntelligenceForEvents)).not.toHaveBeenCalled();
  });

  it("缓存未过期且新闻集合未变化时，不用旧 LLM 结果刷新 generated_at", async () => {
    const item = {
      title: "Nvidia reports data center demand",
      link: "https://example.com/nvda",
      publishedAt: "2026-05-11T01:00:00.000Z",
      source: "benzinga",
      provider: "alpaca",
    };
    queryMock.mockResolvedValueOnce({ rows: [makeCachedRow({ item_hash_set: titleHashSet(item.title) })] });
    vi.mocked(fetchNewsForSymbol).mockResolvedValue([item]);

    const signal = await buildNewsSignalForSymbol("NVDA", "US");

    expect(signal?.llmSummary).toBe("缓存里的新闻判断");
    expect(vi.mocked(upsertDaaNewsItemSnapshots)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analyzeNewsWithLlm)).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertDaaNewsEventSnapshots)).not.toHaveBeenCalled();
    expect(vi.mocked(refreshNewsIntelligenceForEvents)).not.toHaveBeenCalled();
  });

  it("新闻集合变化时，写入 symbol signal 与事件层快照", async () => {
    const item = {
      title: "Nvidia announces formal acquisition",
      link: "https://example.com/nvda-ma",
      publishedAt: "2026-05-11T02:00:00.000Z",
      source: "benzinga",
      provider: "alpaca",
    };
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(fetchNewsForSymbol).mockResolvedValue([item]);
    vi.mocked(analyzeNewsWithLlm).mockResolvedValue({
      sentimentScore: 40,
      summary: "正式并购公告，可能改变增长预期。",
      drivers: { bullish: ["扩张产品线"], bearish: ["整合风险"] },
      majorEvent: { type: "merger_acquisition", impact: "high", description: "公司正式公告并购" },
      actionHint: "关注",
    });

    const signal = await buildNewsSignalForSymbol("NVDA", "US");

    expect(signal?.scorePct).toBe(70);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(upsertDaaNewsEventSnapshots)).toHaveBeenCalledWith([
      expect.objectContaining({
        provider: "alpaca",
        symbol: "NVDA",
        title: item.title,
        llmSummary: "正式并购公告，可能改变增长预期。",
        llmMajorEvent: { type: "merger_acquisition", impact: "high", description: "公司正式公告并购" },
      }),
    ]);
    expect(vi.mocked(refreshNewsIntelligenceForEvents)).toHaveBeenCalledTimes(1);
  });
});
