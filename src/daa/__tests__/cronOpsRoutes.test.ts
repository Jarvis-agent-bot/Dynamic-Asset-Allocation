import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

vi.mock("@/src/daa/cron/auth", () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaExternalPayloadRaw: vi.fn(),
  appendDaaFxRateHistoryRows: vi.fn(),
  appendDaaIngestJobLog: vi.fn(),
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

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn().mockResolvedValue({
    account: { cash: 3200, investableCash: 3000, frozenCash: 0, totalEquity: 52300 },
    baseCurrency: "USD",
    assetUniverse: [
      { symbol: "AAPL", holdingQty: 10, lastPrice: 180, holdingPrice: 170, gapPct: 2.1, watchEnabled: true, targetWeightHint: 0.1 },
    ],
    marketContext: { regime: "risk_on", indicators: [], scopes: [] },
    rebalanceStrategy: { calendar: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, thresholdPct: 0.05 } },
    execution: { logs: [] },
    rebalance: {},
    latestCycle: null,
    warnings: [],
  }),
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
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { buildNewsSignals } from "@/src/daa/signals/newsSignal";
import {
  appendDaaExternalPayloadRaw,
  appendDaaFxRateHistoryRows,
  appendDaaIngestJobLog,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
  upsertDaaFxRates,
} from "@/src/daa/store/daaStorePg";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";

function buildSystemConfig(input?: {
  baseCurrency?: string;
  newsFeed?: {
    enabled?: boolean;
    symbols?: string[];
    query?: string;
  };
  fxFeed?: {
    enabled?: boolean;
    baseCurrency?: string;
    pairs?: unknown;
  };
  autoGenerateEnabled?: boolean;
  telegramOnSuggestion?: boolean;
  feishuOnSuggestion?: boolean;
  telegramDailyReport?: boolean;
  feishuDailyReport?: boolean;
}) {
  const baseCurrency = input?.baseCurrency || "USD";
  return {
    config: {
      dataSources: {
        newsFeed: {
          enabled: input?.newsFeed?.enabled ?? true,
          symbols: input?.newsFeed?.symbols ?? [],
          query: input?.newsFeed?.query ?? "",
        },
        fxFeed: {
          enabled: input?.fxFeed?.enabled ?? true,
          baseCurrency: input?.fxFeed?.baseCurrency ?? baseCurrency,
          pairs: input?.fxFeed?.pairs ?? [],
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
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  vi.mocked(requireCronAuth).mockResolvedValue(null);
  vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfig());
  vi.mocked(listDaaAssetUniverse).mockResolvedValue([] as any[]);
  vi.mocked(listDaaFxRates).mockResolvedValue([] as any[]);
  vi.mocked(appendDaaIngestJobLog).mockResolvedValue(undefined as any);
  vi.mocked(appendDaaExternalPayloadRaw).mockResolvedValue({ id: "raw-1" } as any);
  vi.mocked(appendDaaFxRateHistoryRows).mockResolvedValue(undefined as any);
  vi.mocked(upsertDaaFxRates).mockResolvedValue(undefined as any);
  vi.mocked(buildNewsSignals).mockResolvedValue([] as any[]);
  vi.mocked(parseSymbolsFromNewsQuery).mockReturnValue([]);
  vi.mocked(refreshMarketIndicators).mockResolvedValue({ refreshedCount: 0 } as any);
  vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValue({
    cycle: null,
    created: false,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: "",
    portfolioStatus: "skipped",
  } as any);
  vi.mocked(sendFeishuByEnv).mockResolvedValue(false);
  vi.mocked(sendTelegramByEnv).mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
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
      { symbol: "MSFT", holdingQty: 0, watchEnabled: true },
      { symbol: "BABA", holdingQty: 16, watchEnabled: false },
      { symbol: "0700.HK", holdingQty: 0, watchEnabled: false },
    ] as any[]);
    vi.mocked(parseSymbolsFromNewsQuery).mockReturnValue(["tsla", "MSFT", ""]);
    vi.mocked(buildNewsSignals).mockResolvedValue([
      { items: [{ id: "n1" }, { id: "n2" }] },
      { items: [{ id: "n3" }] },
    ] as any[]);

    const response = await newsRefreshPost(new Request("http://localhost/api/daa/cron/news-refresh", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.refreshedSymbols).toBe(3);
    expect(json.data.signals).toBe(2);
    expect(json.data.items).toBe(3);
    expect(vi.mocked(buildNewsSignals)).toHaveBeenCalledWith({
      symbols: ["TSLA", "BABA", "MSFT"],
    });
    expect(vi.mocked(appendDaaIngestJobLog)).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "cron_news_refresh",
      status: "ok",
      totalCount: 3,
      successCount: 2,
      failureCount: 1,
      diagnosticsJson: expect.objectContaining({
        signalRows: 2,
        itemRows: 3,
      }),
    }));
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
      { currency: "HKD", holdingQty: 10, watchEnabled: false },
      { currency: "CNY", holdingQty: 0, watchEnabled: true },
      { currency: "USD", holdingQty: 1, watchEnabled: true },
    ] as any[]);
    vi.mocked(listDaaFxRates).mockResolvedValue([
      { baseCcy: "USD", quoteCcy: "CNY", asOfTs: todayIso },
    ] as any[]);

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
    expect(vi.mocked(appendDaaFxRateHistoryRows)).toHaveBeenCalledWith([
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
    ]);
    expect(vi.mocked(appendDaaIngestJobLog)).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "cron_fx_refresh",
      status: "partial",
      totalCount: 3,
      successCount: 1,
      failureCount: 1,
      diagnosticsJson: expect.objectContaining({
        skippedCount: 1,
      }),
    }));
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
    vi.mocked(refreshMarketIndicators).mockResolvedValue({ refreshedCount: 4 } as any);
    vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValue({
      cycle: {
        cycleId: "cycle-1",
        triggerReason: "定期再平衡触发",
        riskCheck: { overallStatus: "pass" },
        proposals: [{ symbol: "AAPL", side: "BUY", suggestedNotional: 1000 }],
      },
      created: true,
      skippedByCooldown: false,
      cooldownUntil: null,
      message: "已生成再平衡周期 cycle-1",
      portfolioStatus: "needs_rebalance",
    } as any);
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
});
