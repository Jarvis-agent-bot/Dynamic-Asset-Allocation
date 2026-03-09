import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/cron/authV1", () => ({
  requireCronAuthV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  appendDaaExternalPayloadRawV1: vi.fn(),
  appendDaaFxRateHistoryRowsV1: vi.fn(),
  appendDaaIngestJobLogV1: vi.fn(),
  getDaaSystemConfigV2: vi.fn(),
  listDaaAssetUniverseV1: vi.fn(),
  listDaaFxRatesV1: vi.fn(),
  upsertDaaFxRatesV1: vi.fn(),
}));

vi.mock("@/src/daa/signals/newsSignalV1", () => ({
  buildNewsSignalsV1: vi.fn(),
}));

vi.mock("@/src/market/yahooRssFetchV1", () => ({
  parseSymbolsFromNewsQueryV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/marketContext/marketIndicatorServiceV1", () => ({
  refreshMarketIndicatorsV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchServiceV1", () => ({
  generateWorkbenchRebalanceCycleV1: vi.fn(),
}));

vi.mock("@/src/daa/notify/emailV1", () => ({
  sendEmailByEnvV1: vi.fn(),
}));

import { POST as dailyAnalysisPost } from "@/app/api/daa/cron/daily-analysis/route";
import { POST as fxRefreshPost } from "@/app/api/daa/cron/fx-refresh/route";
import { POST as newsRefreshPost } from "@/app/api/daa/cron/news-refresh/route";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { refreshMarketIndicatorsV1 } from "@/src/daa/modules/marketContext/marketIndicatorServiceV1";
import { generateWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { sendEmailByEnvV1 } from "@/src/daa/notify/emailV1";
import { buildNewsSignalsV1 } from "@/src/daa/signals/newsSignalV1";
import {
  appendDaaExternalPayloadRawV1,
  appendDaaFxRateHistoryRowsV1,
  appendDaaIngestJobLogV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  listDaaFxRatesV1,
  upsertDaaFxRatesV1,
} from "@/src/daa/store/daaStorePgV1";
import { parseSymbolsFromNewsQueryV1 } from "@/src/market/yahooRssFetchV1";

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
  notifyEmailTo?: string;
  emailEnabled?: boolean;
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
        notifyEmailTo: input?.notifyEmailTo ?? "",
      },
      notification: {
        email: {
          onSuggestionGenerated: input?.emailEnabled ?? false,
        },
      },
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  vi.mocked(requireCronAuthV1).mockReturnValue(null);
  vi.mocked(getDaaSystemConfigV2).mockResolvedValue(buildSystemConfig());
  vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([] as any[]);
  vi.mocked(listDaaFxRatesV1).mockResolvedValue([] as any[]);
  vi.mocked(appendDaaIngestJobLogV1).mockResolvedValue(undefined as any);
  vi.mocked(appendDaaExternalPayloadRawV1).mockResolvedValue({ id: "raw-1" } as any);
  vi.mocked(appendDaaFxRateHistoryRowsV1).mockResolvedValue(undefined as any);
  vi.mocked(upsertDaaFxRatesV1).mockResolvedValue(undefined as any);
  vi.mocked(buildNewsSignalsV1).mockResolvedValue([] as any[]);
  vi.mocked(parseSymbolsFromNewsQueryV1).mockReturnValue([]);
  vi.mocked(refreshMarketIndicatorsV1).mockResolvedValue({ refreshedCount: 0 } as any);
  vi.mocked(generateWorkbenchRebalanceCycleV1).mockResolvedValue({
    cycle: null,
    created: false,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: "",
    portfolioStatus: "skipped",
  } as any);
  vi.mocked(sendEmailByEnvV1).mockResolvedValue({ sent: false, reason: "disabled" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cron-ops-routes-v1", () => {
  it("news-refresh 直接路由会按配置、查询与资产池去重后拉取新闻", async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(buildSystemConfig({
      newsFeed: {
        enabled: true,
        symbols: ["tsla", "BABA"],
        query: "tsla, msft, TSLA",
      },
    }));
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([
      { symbol: "MSFT", holdingQty: 0, watchEnabled: true },
      { symbol: "BABA", holdingQty: 16, watchEnabled: false },
      { symbol: "0700.HK", holdingQty: 0, watchEnabled: false },
    ] as any[]);
    vi.mocked(parseSymbolsFromNewsQueryV1).mockReturnValue(["tsla", "MSFT", ""]);
    vi.mocked(buildNewsSignalsV1).mockResolvedValue([
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
    expect(vi.mocked(buildNewsSignalsV1)).toHaveBeenCalledWith({
      symbols: ["TSLA", "BABA", "MSFT"],
    });
    expect(vi.mocked(appendDaaIngestJobLogV1)).toHaveBeenCalledWith(expect.objectContaining({
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

    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(buildSystemConfig({
      baseCurrency: "USD",
      fxFeed: {
        enabled: true,
        baseCurrency: "USD",
        pairs: ["HKD", "EUR/CNY"],
      },
    }));
    vi.mocked(listDaaAssetUniverseV1).mockResolvedValue([
      { currency: "HKD", holdingQty: 10, watchEnabled: false },
      { currency: "CNY", holdingQty: 0, watchEnabled: true },
      { currency: "USD", holdingQty: 1, watchEnabled: true },
    ] as any[]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([
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
    expect(vi.mocked(appendDaaExternalPayloadRawV1)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(upsertDaaFxRatesV1)).toHaveBeenCalledWith([
      expect.objectContaining({
        baseCcy: "USD",
        quoteCcy: "HKD",
        rate: 7.8,
        source: "cron_daily_pull",
      }),
    ]);
    expect(vi.mocked(appendDaaFxRateHistoryRowsV1)).toHaveBeenCalledWith([
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
    expect(vi.mocked(appendDaaIngestJobLogV1)).toHaveBeenCalledWith(expect.objectContaining({
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

  it("daily-analysis 在关闭自动生成时直接跳过", async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(buildSystemConfig({
      autoGenerateEnabled: false,
    }));

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.skipped).toBe(true);
    expect(json.data.reason).toBe("auto generate disabled");
    expect(vi.mocked(refreshMarketIndicatorsV1)).not.toHaveBeenCalled();
    expect(vi.mocked(generateWorkbenchRebalanceCycleV1)).not.toHaveBeenCalled();
    expect(vi.mocked(sendEmailByEnvV1)).not.toHaveBeenCalled();
  });

  it("daily-analysis 生成新周期后会发送通知邮件", async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(buildSystemConfig({
      autoGenerateEnabled: true,
      notifyEmailTo: "ops@example.com",
      emailEnabled: true,
    }));
    vi.mocked(refreshMarketIndicatorsV1).mockResolvedValue({ refreshedCount: 4 } as any);
    vi.mocked(generateWorkbenchRebalanceCycleV1).mockResolvedValue({
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
    vi.mocked(sendEmailByEnvV1).mockResolvedValue({ sent: true, id: "mail-1" });

    const response = await dailyAnalysisPost(new Request("http://localhost/api/daa/cron/daily-analysis", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.created).toBe(true);
    expect(json.data.skipped).toBe(false);
    expect(json.data.cycleId).toBe("cycle-1");
    expect(json.data.proposalCount).toBe(1);
    expect(json.data.email).toEqual(expect.objectContaining({ sent: true, id: "mail-1" }));
    expect(json.data.marketRefresh).toEqual(expect.objectContaining({ ok: true, refreshedCount: 4 }));
    expect(vi.mocked(sendEmailByEnvV1)).toHaveBeenCalledWith(expect.objectContaining({
      to: "ops@example.com",
      subject: expect.stringContaining("DAA 自动再平衡建议"),
      text: expect.stringContaining("AAPL"),
    }));
  });
});
