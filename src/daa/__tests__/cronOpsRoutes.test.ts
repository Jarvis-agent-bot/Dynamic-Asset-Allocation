import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAssetUniverseRow,
  buildAssetUniverseView,
  buildGenerateRebalanceCycleResult,
  buildSystemConfigRow,
  buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture,
} from "@/src/daa/__tests__/testDataFactories";
import type { CurrencyCode } from "@/src/daa/config/currency";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

vi.mock("@/src/daa/cron/auth", () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaExternalPayloadRaw: vi.fn(),
  appendDaaFxRateHistoryRows: vi.fn(),
  getDaaSystemConfig: vi.fn(),
  listDaaAssetUniverse: vi.fn(),
  listDaaFxRates: vi.fn(),
  upsertDaaFxRates: vi.fn(),
}));

vi.mock("@/src/daa/signals/newsSignal", () => ({
  buildNewsSignals: vi.fn(),
}));

vi.mock("@/src/market/yahooRssFetch", () => ({
  parseSymbolsFromNewsQuery: vi.fn(),
}));

vi.mock("@/src/daa/modules/marketContext/marketIndicatorService", () => ({
  refreshMarketIndicators: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchRebalanceCycleService", () => ({
  generateWorkbenchRebalanceCycle: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/executionGateway", () => ({
  executeRebalanceViaGateway: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn().mockResolvedValue(buildWorkbenchBootstrapFixture({
    account: { cash: 3200, investableCash: 3000, frozenCash: 0, totalEquity: 52300 },
    assetUniverse: [
      buildAssetUniverseView({
        symbol: "AAPL",
        holdingQty: 10,
        holdingPrice: 170,
        lastPrice: 180,
        gapPct: 2.1,
        watchEnabled: true,
        targetWeightHint: 0.1,
      }),
    ],
    marketContext: { regime: "risk_on", indicators: [], scopes: [] },
    rebalanceStrategy: { calendar: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, thresholdPct: 0.05 } },
    rebalance: {
      mode: "manual",
      autoAnalysisEnabled: false,
      analysisTimeUtc: "00:20",
      timezone: "Asia/Shanghai",
      analysisFocus: "mock",
    },
  })),
}));

vi.mock("@/src/daa/notify/feishu", () => ({
  sendFeishuByEnv: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/src/daa/notify/telegram", () => ({
  sendTelegramByEnv: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/src/daa/store/jobExecutionLogRepo", () => ({
  appendJobExecutionLog: vi.fn().mockResolvedValue(undefined),
}));

import { POST as dailyAnalysisPost } from "@/app/api/daa/cron/daily-analysis/route";
import { POST as fxRefreshPost } from "@/app/api/daa/cron/fx-refresh/route";
import { POST as newsRefreshPost } from "@/app/api/daa/cron/news-refresh/route";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { buildNewsSignals, type DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import {
  type DaaStoreExternalPayloadRaw,
  type DaaStoreFxRate,
  appendDaaExternalPayloadRaw,
  appendDaaFxRateHistoryRows,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
  upsertDaaFxRates,
} from "@/src/daa/store/daaStorePg";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";

function buildSystemConfig(input?: {
  baseCurrency?: CurrencyCode;
  newsFeed?: {
    enabled?: boolean;
    symbols?: string[];
    query?: string;
  };
  fxFeed?: {
    enabled?: boolean;
    baseCurrency?: CurrencyCode;
    pairs?: unknown;
  };
  autoGenerateEnabled?: boolean;
  telegramOnSuggestion?: boolean;
  feishuOnSuggestion?: boolean;
  telegramDailyReport?: boolean;
  feishuDailyReport?: boolean;
  cognitiveAgentEnabled?: boolean;
}) {
  const baseCurrency: CurrencyCode = input?.baseCurrency || "USD";
  const analysisTimeUtc = `${String(new Date().getUTCHours()).padStart(2, "0")}:00`;
  return buildSystemConfigRow({
    cognitiveAgent: {
      // 默认关闭，以便 daily_report 作为 fallback 能被测试验证
      enabled: input?.cognitiveAgentEnabled ?? false,
    },
    dataSources: {
      newsFeed: {
        enabled: input?.newsFeed?.enabled ?? true,
        symbols: input?.newsFeed?.symbols ?? [],
        query: input?.newsFeed?.query ?? "",
      },
      fxFeed: {
        enabled: input?.fxFeed?.enabled ?? true,
        baseCurrency: input?.fxFeed?.baseCurrency ?? baseCurrency,
        pairs: Array.isArray(input?.fxFeed?.pairs) ? input?.fxFeed?.pairs.map(String) : [],
      },
      priceFeed: {
        marketCache: {
          rawRetentionDays: 90,
        },
      },
    },
    strategy: {
      account: {
        baseCurrency,
      },
    },
    rebalanceStrategy: {
      analysisTimeUtc,
      autoGenerateEnabled: input?.autoGenerateEnabled ?? false,
    },
    notification: {
      dailyAnalysisHourUtc: new Date().getUTCHours(),
      telegram: {
        enabled: (input?.telegramOnSuggestion ?? false) || (input?.telegramDailyReport ?? false),
        onDriftTrigger: false,
        onSuggestionGenerated: input?.telegramOnSuggestion ?? false,
        onTradeExecuted: false,
        dailyReport: input?.telegramDailyReport ?? false,
      },
      feishu: {
        enabled: (input?.feishuOnSuggestion ?? false) || (input?.feishuDailyReport ?? false),
        onDriftTrigger: false,
        onSuggestionGenerated: input?.feishuOnSuggestion ?? false,
        onTradeExecuted: false,
        dailyReport: input?.feishuDailyReport ?? false,
      },
    },
  });
}

function buildExternalPayloadRawFixture(): DaaStoreExternalPayloadRaw {
  return {
    id: "raw-1",
    provider: "test",
    resource: "fixture",
    subjectKey: "fixture",
    requestUrl: "https://example.com",
    requestJson: {},
    responseStatus: 200,
    responseHeadersJson: {},
    payloadJson: {},
    payloadText: "{}",
    fetchedAt: "2026-03-01T00:00:00.000Z",
    expireAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-03-01T00:00:00.000Z",
  };
}

function buildFxRateFixture(overrides?: Partial<DaaStoreFxRate>): DaaStoreFxRate {
  return {
    id: "fx-1",
    baseCcy: "USD",
    quoteCcy: "CNY",
    rate: 7.2,
    source: "fixture",
    asOfTs: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildNewsSignalFixture(input: {
  symbol?: string;
  itemIds: string[];
}): DaaNewsSignal {
  const symbol = input.symbol ?? "AAPL";
  return {
    symbol,
    scorePct: 70,
    confidencePct: 60,
    evidenceCount: input.itemIds.length,
    reasons: [],
    items: input.itemIds.map((id) => ({
      symbol,
      title: id,
      link: null,
      ts: "2026-03-01T00:00:00.000Z",
      sentimentScore: 0.5,
      sourceCredibility: 0.8,
      freshness: 0.9,
    })),
    llmSummary: null,
    llmDrivers: null,
    llmMajorEvent: null,
    llmActionHint: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  vi.mocked(requireCronAuth).mockResolvedValue(null);
  vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig());
  vi.mocked(listDaaAssetUniverse).mockResolvedValue([]);
  vi.mocked(listDaaFxRates).mockResolvedValue([]);
  vi.mocked(appendDaaExternalPayloadRaw).mockResolvedValue(buildExternalPayloadRawFixture());
  vi.mocked(appendDaaFxRateHistoryRows).mockResolvedValue(0);
  vi.mocked(upsertDaaFxRates).mockResolvedValue([]);
  vi.mocked(buildNewsSignals).mockResolvedValue([]);
  vi.mocked(parseSymbolsFromNewsQuery).mockReturnValue([]);
  vi.mocked(refreshMarketIndicators).mockResolvedValue({ marketContext: null, indicators: [], refreshedCount: 0 });
  vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValue(buildGenerateRebalanceCycleResult());
  vi.mocked(executeRebalanceViaGateway).mockResolvedValue({
    cycle: {
      cycleId: "cycle-exec",
      status: "completed",
      triggerSource: "calendar",
      triggerReason: "test",
      snapshotAt: "2026-03-01T00:00:00.000Z",
      equitySnapshot: 1000,
      driftSnapshot: [],
      proposals: [],
      riskCheck: { overallStatus: "pass", items: [] },
      executedAt: "2026-03-01T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
      executedOrders: [],
      executionSummary: null,
      cancelledAt: null,
      cancelReason: null,
      notes: null,
      marketContext: null,
      agentDecisionSnapshot: null,
    },
    logs: [],
  });
  vi.mocked(sendFeishuByEnv).mockResolvedValue(false);
  vi.mocked(sendTelegramByEnv).mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("cron-ops-routes-v1", () => {
  it("news-refresh 直接路由会按配置、查询与资产池去重后拉取新闻", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig({
      newsFeed: {
        enabled: true,
        symbols: ["tsla", "BABA"],
        query: "tsla, msft, TSLA",
      },
    }));
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({ assetKey: "US::MSFT", symbol: "MSFT", holdingQty: 0, watchEnabled: true }),
      buildAssetUniverseRow({ assetKey: "US::BABA", symbol: "BABA", holdingQty: 16, watchEnabled: false }),
      buildAssetUniverseRow({ assetKey: "HK::0700.HK", symbol: "0700.HK", market: "HK", holdingQty: 0, watchEnabled: false }),
    ]);
    vi.mocked(parseSymbolsFromNewsQuery).mockReturnValue(["tsla", "MSFT", ""]);
    vi.mocked(buildNewsSignals).mockResolvedValue([
      buildNewsSignalFixture({ symbol: "TSLA", itemIds: ["n1", "n2"] }),
      buildNewsSignalFixture({ symbol: "MSFT", itemIds: ["n3"] }),
    ]);

    const response = await newsRefreshPost(new Request("http://localhost/api/daa/cron/news-refresh", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.refreshedSymbols).toBe(3);
    expect(json.data.signals).toBe(2);
    expect(json.data.items).toBe(3);
    expect(vi.mocked(buildNewsSignals)).toHaveBeenCalledWith({
      symbolsWithMarket: [
        { symbol: "TSLA", market: "US" },
        { symbol: "BABA", market: "US" },
        { symbol: "MSFT", market: "US" },
      ],
    });
    // news-refresh 使用 runLoggedJob 记录日志
    expect(json.data.jobId).toBeTruthy();
  });

  it("fx-refresh 直接路由会区分更新、跳过与失败的货币对", async () => {
    const todayIso = new Date().toISOString();

    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig({
      baseCurrency: "USD",
      fxFeed: {
        enabled: true,
        baseCurrency: "USD",
        pairs: ["HKD", "EUR/CNY"],
      },
    }));
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({ assetKey: "HK::700", symbol: "700", market: "HK", currency: "HKD", holdingQty: 10, watchEnabled: false }),
      buildAssetUniverseRow({ assetKey: "CN::000001", symbol: "000001", market: "CN", currency: "CNY", holdingQty: 0, watchEnabled: true }),
      buildAssetUniverseRow({ assetKey: "US::CASH", symbol: "CASH", market: "US", currency: "USD", holdingQty: 1, watchEnabled: true }),
    ]);
    vi.mocked(listDaaFxRates).mockResolvedValue([
      buildFxRateFixture({ baseCcy: "USD", quoteCcy: "CNY", asOfTs: todayIso }),
    ]);

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("USDHKD")) {
        return new Response(JSON.stringify({
          chart: {
            result: [{
              meta: { regularMarketPrice: 7.8 },
              indicators: { quote: [{ close: [7.7, 7.8] }] },
            }],
            error: null,
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("EURCNY")) {
        return new Response(JSON.stringify({ error: "upstream down" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await fxRefreshPost(new Request("http://localhost/api/daa/cron/fx-refresh", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.updatedPairs).toEqual(["USD/HKD"]);
    expect(json.data.skippedPairs).toEqual(["USD/CNY"]);
    expect(json.data.failures).toHaveLength(1);
    expect(json.data.failures[0]).toContain("EUR/CNY");
    expect(vi.mocked(appendDaaExternalPayloadRaw)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(upsertDaaFxRates)).toHaveBeenCalledWith([
      expect.objectContaining({
        baseCcy: "USD",
        quoteCcy: "HKD",
        rate: 7.8,
        source: "cron_daily_pull",
      }),
    ]);
    expect(vi.mocked(appendDaaFxRateHistoryRows)).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        baseCcy: "USD",
        quoteCcy: "HKD",
        rate: 7.8,
        status: "fresh",
      }),
      expect.objectContaining({
        baseCcy: "EUR",
        quoteCcy: "CNY",
        rate: 0,
        status: "error",
        errorCode: "http_502",
      }),
    ]));
    // fx-refresh 现在使用 runLoggedJob，job 日志通过 jobService 记录
    expect(json.data.jobId).toBeTruthy();
  });

  it("daily-analysis 在关闭自动生成时跳过生成但仍可发送每日报告", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig({
      autoGenerateEnabled: false,
      telegramDailyReport: true,
    }));
    vi.mocked(sendTelegramByEnv).mockResolvedValue(true);

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.skipped).toBe(true);
    expect(json.data.message).toBe("auto generate disabled");
    expect(vi.mocked(refreshMarketIndicators)).not.toHaveBeenCalled();
    expect(vi.mocked(generateWorkbenchRebalanceCycle)).not.toHaveBeenCalled();
    // Daily report should still be sent
    expect(vi.mocked(buildWorkbenchBootstrap)).toHaveBeenCalledWith({ syncPrices: false });
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledTimes(1);
    expect(json.data.dailyReport.sent).toBe(true);
    expect(json.data.dailyReport.telegram).toBe(true);
  });

  it("daily-analysis 在关闭自动生成且无每日报告时不发送任何通知", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig({
      autoGenerateEnabled: false,
    }));

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.skipped).toBe(true);
    expect(vi.mocked(refreshMarketIndicators)).not.toHaveBeenCalled();
    expect(vi.mocked(generateWorkbenchRebalanceCycle)).not.toHaveBeenCalled();
    expect(vi.mocked(buildWorkbenchBootstrap)).not.toHaveBeenCalled();
    expect(vi.mocked(sendTelegramByEnv)).not.toHaveBeenCalled();
    expect(vi.mocked(sendFeishuByEnv)).not.toHaveBeenCalled();
    expect(json.data.dailyReport.sent).toBe(false);
  });

  it("daily-analysis 生成新周期后会发送通知", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig({
      autoGenerateEnabled: true,
      telegramOnSuggestion: true,
      feishuOnSuggestion: true,
    }));
    vi.mocked(refreshMarketIndicators).mockResolvedValue({ marketContext: null, indicators: [], refreshedCount: 4 });
    vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValue(buildGenerateRebalanceCycleResult({
      cycle: {
        cycleId: "cycle-1",
        triggerReason: "定期再平衡触发",
        riskCheck: { overallStatus: "pass" },
        proposals: [{
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 5,
          suggestedNotional: 1000,
          price: 200,
          reason: "test proposal",
          selected: true,
          hfContribution: null,
        }],
      },
      created: true,
      message: "已生成再平衡周期 cycle-1",
      portfolioStatus: "needs_rebalance",
    }));
    vi.mocked(sendTelegramByEnv).mockResolvedValue(true);
    vi.mocked(sendFeishuByEnv).mockResolvedValue(true);

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.created).toBe(true);
    expect(json.data.skipped).toBe(false);
    expect(json.data.cycleId).toBe("cycle-1");
    expect(json.data.proposalCount).toBe(1);
    expect(json.data.marketRefresh).toEqual(expect.objectContaining({ ok: true, refreshedCount: 4 }));
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || "")).toContain("AAPL");
    expect(vi.mocked(sendFeishuByEnv)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(sendFeishuByEnv).mock.calls[0]?.[0] || "")).toContain("AAPL");
  });

  it("daily-analysis 自动执行会先应用单笔 NAV 硬上限", async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      rebalanceStrategy: {
        analysisTimeUtc: `${String(new Date().getUTCHours()).padStart(2, "0")}:00`,
        autoGenerateEnabled: true,
        autoExecuteEnabled: true,
        autoExecuteMaxSinglePct: 10,
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: false,
          onSuggestionGenerated: false,
          onTradeExecuted: true,
          dailyReport: false,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
      },
    }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildWorkbenchBootstrapFixture({
      account: { cash: 5000, investableCash: 5000, frozenCash: 0, totalEquity: 5000 },
      assetUniverse: [],
    }));
    vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValue(buildGenerateRebalanceCycleResult({
      cycle: {
        cycleId: "cycle-large-1",
        triggerReason: "定期再平衡触发",
        riskCheck: { overallStatus: "pass" },
        proposals: [{
          assetKey: "US::NVDA",
          symbol: "NVDA",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 4,
          suggestedNotional: 1000,
          price: 250,
          reason: "large proposal",
          selected: true,
          hfContribution: null,
        }],
      },
      created: true,
      message: "已生成再平衡周期 cycle-large-1",
      portfolioStatus: "needs_rebalance",
    }));

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.autoExecute).toMatchObject({
      attempted: true,
      executed: false,
      ordersCount: 0,
    });
    expect(json.data.autoExecute.error).toContain("autoExecuteMaxSinglePct");
    expect(vi.mocked(executeRebalanceViaGateway)).not.toHaveBeenCalled();
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledWith(
      expect.stringContaining("自动执行已阻止"),
      expect.objectContaining({
        eventType: "auto_execute_blocked",
        triggerSource: "cron_daily_analysis",
        cycleId: "cycle-large-1",
      }),
    );
  });

  it("daily-analysis 会优先按 analysisTimeUtc 推导整点窗口，而不是继续依赖旧 hourly 字段", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T11:05:00.000Z"));
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      ...buildSystemConfig({ autoGenerateEnabled: false }).config,
      rebalanceStrategy: {
        analysisTimeUtc: "10:51",
        autoGenerateEnabled: false,
      },
      notification: {
        dailyAnalysisHourUtc: 1,
        telegram: {
          enabled: false,
          onDriftTrigger: false,
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
      },
    }));

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.message).toBe("auto generate disabled");
    expect(String(json.data.message)).not.toContain("hour guard");
  });
});
