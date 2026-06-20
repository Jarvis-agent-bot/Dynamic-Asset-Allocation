import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DaaStoreMarketPriceHistory,
  DaaStoreMarketPriceSnapshot,
} from "@/src/daa/store/daaStorePg";

const pgMocks = vi.hoisted(() => ({
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({
    rows: [],
    rowCount: 0,
  })),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaExternalPayloadRaw: vi.fn(async () => ({ id: "raw_test_1" })),
  appendDaaMarketPriceHistoryRows: vi.fn(async () => 0),
  deleteExpiredDaaExternalPayloadRaw: vi.fn(async () => 0),
  deleteOldDaaExternalRequestLogs: vi.fn(async () => 0),
  getDaaMarketCacheHealthStats: vi.fn(async () => ({
    provider: "yfinance",
    totalSnapshots: 0,
    freshCount: 0,
    staleCount: 0,
    missingCount: 0,
    errorCount: 0,
    unsupportedCount: 0,
    recentJobSuccessRatePct: 100,
    recentJobFailureRatePct: 0,
  })),
  listDaaMarketPriceSnapshots: vi.fn(async () => []),
  listLatestDaaMarketPriceHistoryRows: vi.fn(async () => []),
  upsertDaaMarketPriceSnapshots: vi.fn(async (rows: Array<Record<string, unknown>>) => rows.map((row) => ({
    provider: String(row.provider || "yfinance"),
    market: String(row.market || "US").toUpperCase(),
    symbol: String(row.symbol || "").toUpperCase(),
    normalizedSymbol: String(row.normalizedSymbol || row.symbol || "").toUpperCase(),
    currency: String(row.currency || "USD").toUpperCase(),
    price: Number(row.price || 0),
    status: String(row.status || "missing"),
    priceUpdatedAt: row.priceUpdatedAt ? String(row.priceUpdatedAt) : null,
    source: String(row.source || "test"),
    errorCode: row.errorCode ? String(row.errorCode) : null,
    errorMessage: row.errorMessage ? String(row.errorMessage) : null,
    rawRefId: row.rawRefId ? String(row.rawRefId) : null,
    updatedAt: new Date().toISOString(),
  }))),
}));

vi.mock("@/src/daa/store/jobStore", () => ({
  appendDaaExternalRequestLog: vi.fn(async () => ({ id: "external_log_test" })),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  daaPgPool: vi.fn(() => ({ query: pgMocks.query })),
}));

import {
  appendDaaExternalPayloadRaw,
  appendDaaMarketPriceHistoryRows,
  listDaaMarketPriceSnapshots,
  listLatestDaaMarketPriceHistoryRows,
  upsertDaaMarketPriceSnapshots,
} from "@/src/daa/store/daaStorePg";
import {
  getMarketPricesWithCache,
  refreshMarketPrices,
  runUnifiedDataCleanup,
} from "@/src/daa/modules/marketCache/marketCacheService";

const TEST_NOW = new Date("2026-06-08T12:00:00.000Z");

function buildSnapshotFixture(
  overrides?: Partial<DaaStoreMarketPriceSnapshot>,
): DaaStoreMarketPriceSnapshot {
  return {
    provider: "yfinance",
    market: "US",
    symbol: "AAPL",
    normalizedSymbol: "AAPL",
    currency: "USD",
    price: 188.12,
    status: "fresh",
    priceUpdatedAt: new Date().toISOString(),
    source: "test",
    errorCode: null,
    errorMessage: null,
    rawRefId: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildHistoryFixture(
  overrides?: Partial<DaaStoreMarketPriceHistory>,
): DaaStoreMarketPriceHistory {
  return {
    provider: "yfinance",
    market: "US",
    symbol: "AAPL",
    ts: "2026-03-06T00:00:00.000Z",
    price: 188.12,
    currency: "USD",
    source: "market_cache",
    fetchedAt: "2026-03-06T00:05:00.000Z",
    rawRefId: null,
    ...overrides,
  };
}

function buildChartPayload(price: number, ts = "2026-03-06T00:00:00.000Z"): string {
  const unix = Math.floor(Date.parse(ts) / 1000);
  return JSON.stringify({
    chart: {
      result: [
        {
          timestamp: [unix],
          indicators: {
            quote: [{ close: [price] }],
          },
        },
      ],
      error: null,
    },
  });
}

describe("market-cache-service-v1", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
    vi.clearAllMocks();
    pgMocks.query.mockReset();
    pgMocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([]);
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("快照状态为 stale 时即使较新也返回 stale", async () => {
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([
      buildSnapshotFixture({
        status: "stale",
      }),
    ]);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
      allowRefresh: false,
    });

    expect(result["US::AAPL"]?.price).toBe(188.12);
    expect(result["US::AAPL"]?.priceStatus).toBe("stale");
  });

  it("stale 超过可服务窗口返回 missing", async () => {
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([
      buildSnapshotFixture({
        price: 199,
        status: "stale",
        priceUpdatedAt: "2026-03-01T00:00:00.000Z",
      }),
    ]);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
      allowRefresh: false,
      freshSec: 60,
      serveStaleSec: 3600,
    });

    expect(result["US::AAPL"]?.priceStatus).toBe("missing");
    expect(result["US::AAPL"]?.price).toBe(0);
  });

  it("429 后会单次重试并写入 fresh 快照", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response(buildChartPayload(321.45, new Date().toISOString()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "MSFT", currency: "USD" }],
      allowRefresh: true,
      refreshBudget: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result["US::MSFT"]?.price).toBe(321.45);
    expect(result["US::MSFT"]?.priceStatus).toBe("fresh");
    expect(vi.mocked(appendDaaMarketPriceHistoryRows)).toHaveBeenCalledTimes(1);
  });

  it("高频 yfinance latest raw payload 最多保留 14 天，避免 5 分钟 cron 堆满 raw 表", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(buildChartPayload(321.45, new Date().toISOString()), { status: 200 })));

    await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "MSFT", currency: "USD" }],
      allowRefresh: true,
      forceRefresh: true,
      refreshBudget: 1,
      rawRetentionDays: 90,
    });

    const rawInput = vi.mocked(appendDaaExternalPayloadRaw).mock.calls.at(-1)?.[0];
    expect(rawInput?.resource).toBe("yfinance.chart.latest");
    expect(rawInput?.expireAt).toBe("2026-06-22T12:00:00.000Z");
  });

  it("latest close 使用行情 bar 日期作为 priceUpdatedAt，而不是抓取时间", async () => {
    const fetchMock = vi.fn(async () => new Response(buildChartPayload(195, "2026-06-05T20:00:00.000Z"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
      allowRefresh: true,
      forceRefresh: true,
      refreshBudget: 1,
      freshSec: 60,
      serveStaleSec: 7 * 24 * 3600,
    });

    expect(result["US::AAPL"]?.price).toBe(195);
    expect(result["US::AAPL"]?.priceUpdatedAt).toBe("2026-06-05T20:00:00.000Z");
    expect(result["US::AAPL"]?.priceStatus).toBe("stale");
  });

  it("写入快照时区分行情时间和本次抓取时间", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(buildChartPayload(195, "2026-06-05T20:00:00.000Z"), { status: 200 })));

    const beforeMs = Date.now();
    await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
      allowRefresh: true,
      forceRefresh: true,
      refreshBudget: 1,
    });
    const afterMs = Date.now();

    const latestUpsertInput = vi.mocked(upsertDaaMarketPriceSnapshots).mock.calls.at(-1)?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(latestUpsertInput?.priceUpdatedAt).toBe("2026-06-05T20:00:00.000Z");
    const fetchedAtMs = Date.parse(String(latestUpsertInput?.fetchedAt || ""));
    expect(fetchedAtMs).toBeGreaterThanOrEqual(beforeMs);
    expect(fetchedAtMs).toBeLessThanOrEqual(afterMs);
    expect(latestUpsertInput?.fetchedAt).not.toBe(latestUpsertInput?.priceUpdatedAt);

    const latestHistoryInput = vi.mocked(appendDaaMarketPriceHistoryRows).mock.calls.at(-1)?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(latestHistoryInput?.ts).toBe("2026-06-05T20:00:00.000Z");
    const historyFetchedAtMs = Date.parse(String(latestHistoryInput?.fetchedAt || ""));
    expect(historyFetchedAtMs).toBeGreaterThanOrEqual(beforeMs);
    expect(historyFetchedAtMs).toBeLessThanOrEqual(afterMs);
    expect(latestHistoryInput?.fetchedAt).not.toBe(latestHistoryInput?.ts);
  });

  it("刷新失败时会从 history 回捞最后成功价并标记 stale", async () => {
    const fallbackPriceUpdatedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([
      buildSnapshotFixture({
        market: "US",
        symbol: "NVDA",
        normalizedSymbol: "NVDA",
        price: 0,
        status: "missing",
        priceUpdatedAt: null,
        errorCode: "upstream_error",
        errorMessage: "quote unavailable",
      }),
    ]);
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([
      buildHistoryFixture({
        market: "US",
        symbol: "NVDA",
        ts: fallbackPriceUpdatedAt,
        price: 700.11,
        rawRefId: "raw_hist_1",
      }),
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "NVDA", currency: "USD" }],
      allowRefresh: true,
      refreshBudget: 1,
      freshSec: 10,
      serveStaleSec: 24 * 3600,
    });

    expect(result["US::NVDA"]?.price).toBe(700.11);
    expect(result["US::NVDA"]?.priceStatus).toBe("stale");
    expect(result["US::NVDA"]?.priceUpdatedAt).toBe(fallbackPriceUpdatedAt);
    const latestUpsertInput = vi.mocked(upsertDaaMarketPriceSnapshots).mock.calls.at(-1)?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(latestUpsertInput?.price).toBe(700.11);
    expect(latestUpsertInput?.status).toBe("stale");
    expect(latestUpsertInput?.priceUpdatedAt).toBe(fallbackPriceUpdatedAt);
  });

  it("禁用刷新时也会回捞 history 的最后成功价", async () => {
    const fallbackPriceUpdatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([
      buildHistoryFixture({
        market: "US",
        symbol: "AMD",
        ts: fallbackPriceUpdatedAt,
        price: 188.88,
        rawRefId: "raw_hist_2",
      }),
    ]);

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "AMD", currency: "USD" }],
      allowRefresh: false,
      serveStaleSec: 24 * 3600,
    });

    expect(result["US::AMD"]?.price).toBe(188.88);
    expect(result["US::AMD"]?.priceStatus).toBe("stale");
    expect(vi.mocked(upsertDaaMarketPriceSnapshots)).not.toHaveBeenCalled();
  });

  it("无历史成功值且上游失败时返回 missing", async () => {
    vi.mocked(listDaaMarketPriceSnapshots).mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));

    const result = await getMarketPricesWithCache({
      assets: [{ market: "US", symbol: "TSLA", currency: "USD" }],
      allowRefresh: true,
      refreshBudget: 1,
    });

    expect(result["US::TSLA"]?.priceStatus).toBe("missing");
    expect(result["US::TSLA"]?.price).toBe(0);
    const latestUpsertInput = vi.mocked(upsertDaaMarketPriceSnapshots).mock.calls.at(-1)?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(latestUpsertInput?.priceUpdatedAt ?? null).toBeNull();
    expect(vi.mocked(listDaaMarketPriceSnapshots)).toHaveBeenCalledTimes(1);
  });

  it("refreshMarketPrices 只把 fresh 成功计入 refreshed，stale 回退单独统计", async () => {
    const fallbackPriceUpdatedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    vi.mocked(listLatestDaaMarketPriceHistoryRows).mockResolvedValue([
      buildHistoryFixture({
        market: "US",
        symbol: "NVDA",
        ts: fallbackPriceUpdatedAt,
        price: 700.11,
      }),
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));

    const result = await refreshMarketPrices({
      assets: [{ market: "US", symbol: "NVDA", currency: "USD" }],
      triggerSource: "test",
      timeoutMs: 800,
    });

    expect(result.refreshed).toBe(0);
    expect(result.stale).toBe(1);
    expect(result.missing).toBe(0);
  });

  it("统一清理会分批删除超过 14 天的 yfinance latest raw payload", async () => {
    pgMocks.query.mockImplementation(async (sql: string) => ({
      rows: [],
      rowCount: sql.includes("resource = $2") ? 3 : 0,
    }));

    const result = await runUnifiedDataCleanup();

    const latestRawCleanupCall = pgMocks.query.mock.calls.find((call) =>
      String(call[0]).includes("daa_external_payload_raw_v1")
      && String(call[0]).includes("provider = $1")
      && String(call[0]).includes("resource = $2"),
    );
    expect(latestRawCleanupCall).toBeTruthy();
    expect(latestRawCleanupCall?.[1]).toEqual(["yfinance", "yfinance.chart.latest", 14, 20000]);
    expect(result.raw_payload_latest).toBe(3);
  });
});
