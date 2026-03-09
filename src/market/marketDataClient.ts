import { isApiResponseV1 } from "@/src/daa/api/contractsV1";

import type { PriceBar } from "../core/domain";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type MarketDataClient = {
  twitter: {
    list(params: { listId: string; limit?: number }): Promise<unknown>;
    community(params: { communityId: string; cursor?: string; limit?: number }): Promise<unknown>;
    userByScreenName(params: { screenName: string }): Promise<unknown>;
    userTweets(params: { restId: string; includeReplies?: boolean; cursor?: string; limit?: number }): Promise<unknown>;
    search(params: { rawQuery: string; cursor?: string; limit?: number }): Promise<unknown>;
  };
  yahoo: {
    rss(params: { symbol: string }): Promise<unknown>;
  };
  xueqiu: {
    quoteC(params: { symbol: string }): Promise<unknown>;
  };
  danjuan: {
    fundAssetPercent(params: { fundCode: string; reportDate: string }): Promise<unknown>;
  };
  yfinance: {
    priceSeries(params: { symbol: string; start?: string; end?: string; adjusted?: boolean }): Promise<YfinancePriceSeriesApiResponse>;
    priceSeriesBars(params: { symbol: string; start?: string; end?: string; adjusted?: boolean }): Promise<PriceBar[]>;
  };
};

export type YfinancePriceSeriesApiResponse = {
  source?: string;
  interval?: string;
  priceMode?: "adjclose" | "close";
  rawCount?: number;
  symbol?: string;
  normalizedSymbol?: string;
  upstream?: string;
  series?: PriceBar[];
  issues?: string[];
};

function normalizeBase(base: string): string {
  return String(base || "").replace(/\/+$/, "");
}

function clampLimit(limit: number | undefined, max: number): string | null {
  if (!Number.isFinite(limit)) return null;
  if (!limit || limit <= 0) return null;
  return String(Math.min(max, Math.trunc(limit)));
}

async function readJsonBestEffort(text: string): Promise<unknown> {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { _raw: trimmed };
  }
}

function toErrorMessage(payload: any, status: number): string {
  const apiMessage = typeof payload?.error?.message === "string" ? payload.error.message.trim() : "";
  if (apiMessage) return apiMessage;

  const apiDetailMessage = typeof payload?.error?.details?.message === "string"
    ? payload.error.details.message.trim()
    : "";
  if (apiDetailMessage) return apiDetailMessage;

  const legacyError = typeof payload?.error === "string" ? payload.error.trim() : "";
  if (legacyError) return legacyError;

  const legacyMessage = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (legacyMessage) return legacyMessage;

  const raw = typeof payload?._raw === "string" ? payload._raw.trim() : "";
  return raw || `http ${status}`;
}

export function createMarketDataClient(opts: { endpointBase?: string; fetch?: FetchLike } = {}): MarketDataClient {
  const base = normalizeBase(opts.endpointBase ?? "");
  const fetchFn: FetchLike = opts.fetch ?? fetch;

  async function getJson<T>(path: string, qs?: URLSearchParams, init?: RequestInit): Promise<T> {
    const url = `${base}${path}${qs && qs.toString() ? `?${qs.toString()}` : ""}`;

    const response = await fetchFn(url, {
      method: "GET",
      ...init,
    });

    const text = await response.text();
    const payload = await readJsonBestEffort(text);

    if (!response.ok) {
      throw new Error(toErrorMessage(payload, response.status));
    }

    if (isApiResponseV1(payload)) {
      if (!payload.ok) {
        throw new Error(toErrorMessage(payload, response.status));
      }
      return payload.data as T;
    }

    return payload as T;
  }

  const noStore: RequestInit = { cache: "no-store" };

  const client: MarketDataClient = {
    twitter: {
      async list(params) {
        const qs = new URLSearchParams();
        qs.set("listId", String(params.listId || "").trim());
        const limit = clampLimit(params.limit, 200);
        if (limit) qs.set("limit", limit);
        return getJson("/api/daa/market/twitter/list", qs, noStore);
      },
      async community(params) {
        const qs = new URLSearchParams();
        qs.set("communityId", String(params.communityId || "").trim());
        const cursor = String(params.cursor || "").trim();
        if (cursor) qs.set("cursor", cursor);
        const limit = clampLimit(params.limit, 200);
        if (limit) qs.set("limit", limit);
        return getJson("/api/daa/market/twitter/community", qs, noStore);
      },
      async userByScreenName(params) {
        const qs = new URLSearchParams();
        qs.set("screenName", String(params.screenName || "").trim().replace(/^@/, ""));
        return getJson("/api/daa/market/twitter/user-by-screen-name", qs, noStore);
      },
      async userTweets(params) {
        const qs = new URLSearchParams();
        qs.set("restId", String(params.restId || "").trim());
        if (params.includeReplies) qs.set("includeReplies", "1");
        const cursor = String(params.cursor || "").trim();
        if (cursor) qs.set("cursor", cursor);
        const limit = clampLimit(params.limit, 200);
        if (limit) qs.set("limit", limit);
        return getJson("/api/daa/market/twitter/user-tweets", qs, noStore);
      },
      async search(params) {
        const qs = new URLSearchParams();
        qs.set("rawQuery", String(params.rawQuery || "").trim());
        const cursor = String(params.cursor || "").trim();
        if (cursor) qs.set("cursor", cursor);
        const limit = clampLimit(params.limit, 200);
        if (limit) qs.set("limit", limit);
        return getJson("/api/daa/market/twitter/search", qs, noStore);
      },
    },
    yahoo: {
      async rss(params) {
        const qs = new URLSearchParams();
        qs.set("symbol", String(params.symbol || "").trim());
        return getJson("/api/daa/market/yahoo/rss", qs, noStore);
      },
    },
    xueqiu: {
      async quoteC(params) {
        const qs = new URLSearchParams();
        qs.set("symbol", String(params.symbol || "").trim());
        return getJson("/api/daa/market/xueqiu/quotec", qs, noStore);
      },
    },
    danjuan: {
      async fundAssetPercent(params) {
        const qs = new URLSearchParams();
        qs.set("fund_code", String(params.fundCode || "").trim());
        qs.set("report_date", String(params.reportDate || "").trim());
        return getJson("/api/daa/market/danjuan/fund/asset-percent", qs, noStore);
      },
    },
    yfinance: {
      async priceSeries(params) {
        const qs = new URLSearchParams();
        qs.set("symbol", String(params.symbol || "").trim());
        if (params.start) qs.set("start", params.start);
        if (params.end) qs.set("end", params.end);
        if (typeof params.adjusted === "boolean") qs.set("adjusted", params.adjusted ? "1" : "0");
        return getJson<YfinancePriceSeriesApiResponse>("/api/daa/market/yfinance/price-series", qs, noStore);
      },
      async priceSeriesBars(params) {
        const payload = await client.yfinance.priceSeries(params);

        const series = Array.isArray(payload.series) ? payload.series : [];
        if (!series.length) {
          const issues = Array.isArray(payload.issues) ? payload.issues.join("; ") : "";
          throw new Error(`yfinance price-series route returned empty series${issues ? ` (${issues})` : ""}`);
        }

        return series;
      },
    },
  };

  return client;
}
