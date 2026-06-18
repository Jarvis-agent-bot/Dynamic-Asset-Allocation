import { describe, expect, it } from "vitest";

import {
  buildNewsIntelligenceArtifacts,
  type NewsIntelligenceEventInput,
} from "@/src/daa/modules/news-intelligence/newsIntelligenceService";
import { buildAssetUniverseView } from "@/src/daa/__tests__/testDataFactories";

function makeEvent(overrides: Partial<NewsIntelligenceEventInput> = {}): NewsIntelligenceEventInput {
  return {
    provider: "alpaca",
    symbol: "NVDA",
    eventHash: "evt_nvda_hbm",
    itemHash: "item_nvda_hbm",
    title: "Nvidia AI server demand lifts HBM memory and semiconductor supply chain",
    link: "https://example.com/nvda-hbm",
    source: "benzinga",
    scorePct: 82,
    confidencePct: 86,
    llmSummary: "AI 服务器需求带动 HBM 存储和半导体供应链景气。",
    llmDrivers: {
      bullish: ["数据中心需求强", "HBM 存储供需紧张"],
      bearish: ["供应链交付风险"],
    },
    llmMajorEvent: {
      type: "product_launch",
      impact: "high",
      description: "英伟达相关 AI 服务器需求显著影响半导体链条",
    },
    llmActionHint: "关注半导体产业链",
    analyzedAt: "2026-05-11T02:00:00.000Z",
    ...overrides,
  };
}

describe("newsIntelligenceService", () => {
  it("为高影响 NVDA 新闻生成半导体事件图和持仓风险影响", () => {
    const artifacts = buildNewsIntelligenceArtifacts({
      events: [makeEvent()],
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::NVDA",
          symbol: "NVDA",
          displayNameZh: "英伟达",
          holdingQty: 2,
          valuationBase: 200,
          actualWeightPct: 20,
          watchEnabled: true,
        }),
      ],
    });

    expect(artifacts.eventGraphs).toHaveLength(1);
    expect(artifacts.eventGraphs[0]).toMatchObject({
      symbol: "NVDA",
      themeKey: "semiconductor",
      themeLabelZh: "半导体",
    });
    expect(artifacts.eventGraphs[0].relatedAssets.map((asset) => asset.assetKey)).toContain("US::NVDA");

    const nvdaImpact = artifacts.portfolioImpacts.find((impact) => impact.assetKey === "US::NVDA");
    expect(nvdaImpact).toMatchObject({
      impactScope: "holding",
      impactLevel: "risk",
      recommendedAction: "review_thesis",
    });
  });

  it("从半导体/HBM 主题发现候选，但不把已观察资产重复写成候选", () => {
    const artifacts = buildNewsIntelligenceArtifacts({
      events: [makeEvent()],
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::NVDA",
          symbol: "NVDA",
          displayNameZh: "英伟达",
          holdingQty: 1,
          valuationBase: 100,
          actualWeightPct: 10,
          watchEnabled: true,
        }),
        buildAssetUniverseView({
          assetKey: "US::MU",
          symbol: "MU",
          displayNameZh: "美光科技",
          holdingQty: 0,
          watchEnabled: true,
        }),
      ],
    });

    const candidateKeys = artifacts.discoveryCandidates.map((candidate) => candidate.assetKey);
    expect(candidateKeys).toContain("US::AVGO");
    expect(candidateKeys).toContain("US::TSM");
    expect(candidateKeys).not.toContain("US::MU");

    const muImpact = artifacts.portfolioImpacts.find((impact) => impact.assetKey === "US::MU");
    expect(muImpact).toMatchObject({
      impactScope: "watchlist",
      impactLevel: "review",
    });
    expect(artifacts.discoveryCandidates.every((candidate) => candidate.status === "new")).toBe(true);
  });

  it("候选发现保持只读建议语义，不生成交易动作", () => {
    const artifacts = buildNewsIntelligenceArtifacts({
      events: [makeEvent()],
      assetUniverse: [],
    });

    expect(artifacts.discoveryCandidates.length).toBeGreaterThan(0);
    expect(artifacts.discoveryCandidates.every((candidate) => candidate.reasonZh.includes("不会自动加入观察列表或交易"))).toBe(true);
    expect(artifacts.portfolioImpacts.every((impact) => impact.recommendedAction !== "record")).toBe(true);
  });

  it("低于最小市值的残留仓位不被新闻智能层标成 holding", () => {
    const artifacts = buildNewsIntelligenceArtifacts({
      events: [makeEvent()],
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::NVDA",
          symbol: "NVDA",
          displayNameZh: "英伟达",
          holdingQty: 0.00000066,
          valuationBase: 0.00001,
          actualWeightPct: 0.0000001,
          watchEnabled: false,
          targetWeightHint: 0,
        }),
      ],
    });

    const nvdaImpact = artifacts.portfolioImpacts.find((impact) => impact.assetKey === "US::NVDA");
    expect(nvdaImpact).toMatchObject({
      impactScope: "related_candidate",
      impactLevel: "review",
    });
  });

  it("旧 targetWeightHint 残留但有效目标为 0 时不标成 target", () => {
    const artifacts = buildNewsIntelligenceArtifacts({
      events: [makeEvent()],
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::NVDA",
          symbol: "NVDA",
          displayNameZh: "英伟达",
          holdingQty: 0,
          valuationBase: 0,
          actualWeightPct: 0,
          watchEnabled: false,
          targetWeightHint: 0.2,
          targetWeightPct: 0,
        }),
      ],
    });

    const nvdaImpact = artifacts.portfolioImpacts.find((impact) => impact.assetKey === "US::NVDA");
    expect(nvdaImpact).toMatchObject({
      impactScope: "related_candidate",
      impactLevel: "review",
    });
  });
});
