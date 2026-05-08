/**
 * Watchlist Entry Service — 单元测试（mock 掉 DB 存储 + 信号构建器，
 * 只校验 service 的筛选、阈值、限流、冷静期、现金分配逻辑）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import type { AssetUniverseView, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import type { DaaValuationSignal } from "@/src/daa/signals/valuationSignal";

vi.mock("@/src/daa/store/watchlistAutoEntryStore", () => ({
  listActiveWatchlistAutoEntries: vi.fn(),
  markWatchlistEntryTriggered: vi.fn(),
  getWatchlistAutoEntry: vi.fn(),
  updateWatchlistAutoEntry: vi.fn(),
}));

vi.mock("@/src/daa/signals/technicalSignal", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/src/daa/signals/technicalSignal")>();
  return { ...mod, buildTechnicalSignalForSymbol: vi.fn() };
});
vi.mock("@/src/daa/signals/valuationSignal", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/src/daa/signals/valuationSignal")>();
  return { ...mod, buildValuationSignalForSymbol: vi.fn() };
});

import { generateWatchlistEntryProposals } from "@/src/daa/modules/workbench/watchlistEntryService";
import { listActiveWatchlistAutoEntries } from "@/src/daa/store/watchlistAutoEntryStore";
import { buildTechnicalSignalForSymbol } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignalForSymbol } from "@/src/daa/signals/valuationSignal";

// ── 测试数据 ──

function mockAsset(overrides: Partial<AssetUniverseView> = {}): AssetUniverseView {
  return {
    assetKey: "US::SPY",
    symbol: "SPY",
    market: "US",
    currency: "USD",
    assetClass: "ETF",
    region: "US",
    exchange: "NYSEARCA",
    instrumentType: "ETF",
    marketGroup: "US_EQUITY",
    yfinanceSymbol: "SPY",
    holdingQty: 0,
    holdingPrice: 0,
    costBasis: null,
    costBasisInBase: null,
    unrealizedPnlBase: null,
    unrealizedPnlPct: null,
    holdingTags: [],
    watchEnabled: true,
    autoEntryEnabled: false,
    entryTargetWeightPct: null,
    entryCooldownDays: 14,
    lastEntryTriggeredAt: null,
    targetWeightHint: 0,
    watchTags: [],
    notes: null,
    priceAlertAbove: null,
    priceAlertBelow: null,
    lastPrice: 500,
    priceUpdatedAt: new Date().toISOString(),
    priceStatus: "fresh",
    priceSource: "yahoo",
    priceAgeSec: 30,
    valuationBase: null,
    fxRateToBase: 1,
    fxMissing: false,
    actualWeightPct: 0,
    targetWeightPct: 0,
    gapPct: null,
    hfSignal: null,
    ...overrides,
  };
}

function mockBootstrap(assets: AssetUniverseView[], cash = 10000, equity = 50000): WorkbenchBootstrap {
  return {
    baseCurrency: "USD",
    account: { cash, investableCash: cash, frozenCash: 0, totalEquity: equity },
    assetUniverse: assets,
    execution: { logs: [], cycles: [], slippageBps: 0, feeRateBps: 5 },
    marketContext: null,
    marketContextAttribution: null,
    workbenchVersion: "test",
  } as unknown as WorkbenchBootstrap;
}

function mockSystemConfig(enabled: boolean, overrides: Partial<NonNullable<DaaSystemConfig["watchlistEntry"]>> = {}): DaaSystemConfig {
  return {
    watchlistEntry: {
      enabled,
      maxPerCycle: 2,
      defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
      notionalCashCapPct: 0.3,
      ...overrides,
    },
  } as DaaSystemConfig;
}

function mockTech(scorePct: number, momentumRegime: "strong" | "neutral" | "weak" = "neutral"): DaaTechnicalSignal {
  return { symbol: "SPY", scorePct, confidencePct: 70, momentumRegime, metrics: {} as DaaTechnicalSignal["metrics"], specific: [], reasons: [] };
}
function mockVal(scorePct: number): DaaValuationSignal {
  return { symbol: "SPY", scorePct, confidencePct: 65, temperature: "neutral", metrics: {} as DaaValuationSignal["metrics"], relative: null, reasons: [], specific: [] };
}

beforeEach(() => {
  vi.mocked(listActiveWatchlistAutoEntries).mockReset();
  vi.mocked(buildTechnicalSignalForSymbol).mockReset();
  vi.mocked(buildValuationSignalForSymbol).mockReset();
});

describe("generateWatchlistEntryProposals", () => {
  it("全局开关关闭时直接返回空", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset()]),
      systemConfig: mockSystemConfig(false),
    });
    expect(result.proposals).toHaveLength(0);
    expect(listActiveWatchlistAutoEntries).not.toHaveBeenCalled();
  });

  it("观察列表为空时直接返回空", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([]);
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.evaluations).toHaveLength(0);
  });

  it("未启用自动建仓时，即使已有目标权重也不会自动买入", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([]);
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ targetWeightHint: 0.05 })]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.evaluations[0]?.rejectReason).toMatch(/未启用自动建仓/);
  });

  it("已持仓 → 跳过并记录 rejectReason", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ holdingQty: 10, autoEntryEnabled: true })]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.evaluations).toHaveLength(0);
  });

  it("冷静期未过 → 跳过", async () => {
    const recent = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: recent },
    ]);
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ autoEntryEnabled: true, lastEntryTriggeredAt: recent })]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.evaluations[0]?.rejectReason).toMatch(/冷静期/);
  });

  it("信号达标且 entryTargetWeightPct 为空时，会回退到 targetWeightHint 生成 BUY 提案", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: null, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    vi.mocked(buildTechnicalSignalForSymbol).mockResolvedValue(mockTech(75, "strong"));
    vi.mocked(buildValuationSignalForSymbol).mockResolvedValue(mockVal(70));

    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ autoEntryEnabled: true, targetWeightHint: 0.05 })], 10000, 50000),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.side).toBe("BUY");
    expect(result.proposals[0]?.proposalType).toBe("watchlist_entry");
    expect(result.proposals[0]?.targetWeightPct).toBe(5);
    expect(result.proposals[0]?.reason).toMatch(/观察列表自动建仓/);
    // 目标 5% × 50000 = 2500，现金上限 30% × 10000 = 3000 → min = 2500
    expect(result.proposals[0]?.suggestedNotional).toBeCloseTo(2500, 0);
  });

  it("阈值未过 → 不生成提案", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    vi.mocked(buildTechnicalSignalForSymbol).mockResolvedValue(mockTech(50));
    vi.mocked(buildValuationSignalForSymbol).mockResolvedValue(mockVal(70));
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ autoEntryEnabled: true })]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.evaluations[0]?.rejectReason).toMatch(/技术评分/);
  });

  it("maxPerCycle=1 时限流生效，按融合分排序", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::AAA", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: null },
      { assetKey: "US::BBB", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: null, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    vi.mocked(buildTechnicalSignalForSymbol)
      .mockResolvedValueOnce(mockTech(70))
      .mockResolvedValueOnce(mockTech(90));
    vi.mocked(buildValuationSignalForSymbol)
      .mockResolvedValueOnce(mockVal(70))
      .mockResolvedValueOnce(mockVal(85));

    const assets = [
      mockAsset({ assetKey: "US::AAA", symbol: "AAA", autoEntryEnabled: true }),
      mockAsset({ assetKey: "US::BBB", symbol: "BBB", autoEntryEnabled: true }),
    ];
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap(assets, 10000, 50000),
      systemConfig: mockSystemConfig(true, { maxPerCycle: 1 }),
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.assetKey).toBe("US::BBB"); // 融合分 87.5 > 70
  });

  it("每资产 overrides 覆盖全局阈值", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: { minTechnicalScore: 40, minValuationScore: 40, minFusionScore: 40 }, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    vi.mocked(buildTechnicalSignalForSymbol).mockResolvedValue(mockTech(45));
    vi.mocked(buildValuationSignalForSymbol).mockResolvedValue(mockVal(45));
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ autoEntryEnabled: true })]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(1);
  });

  it("requireStrongMomentum 未满足 → 阻断建仓", async () => {
    vi.mocked(listActiveWatchlistAutoEntries).mockResolvedValue([
      { assetKey: "US::SPY", autoEntryEnabled: true, entryTargetWeightPct: 5, entryRules: { requireStrongMomentum: true }, entryCooldownDays: 14, lastEntryTriggeredAt: null },
    ]);
    vi.mocked(buildTechnicalSignalForSymbol).mockResolvedValue(mockTech(80, "neutral"));
    vi.mocked(buildValuationSignalForSymbol).mockResolvedValue(mockVal(70));
    const result = await generateWatchlistEntryProposals({
      bootstrap: mockBootstrap([mockAsset({ autoEntryEnabled: true })]),
      systemConfig: mockSystemConfig(true),
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.evaluations[0]?.rejectReason).toMatch(/强动量/);
  });
});
