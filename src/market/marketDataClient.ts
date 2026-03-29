import { isApiResponse } from "@/src/daa/api/contracts";

import type { PriceBar } from "../core/domain";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type MarketDataClient = {
  yahoo: {
    rss(params: { symbol: string }): Promise<unknown>;
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

async function readJsonBestEffort(text: string): Promise<unknown> {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (err) {
  logSwallowed("marketDataClient.parseJson", err);
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

  const fallbackError = typeof payload?.error === "string" ? payload.error.trim() : "";
  if (fallbackError) return fallbackError;

  const fallbackMessage = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (fallbackMessage) return fallbackMessage;

  const raw = typeof payload?._raw === "string" ? payload._raw.trim() : "";
  return raw || `http ${status}`;
}

function mergeHeaders(baseHeaders: HeadersInit | undefined, nextHeaders: HeadersInit | undefined): HeadersInit | undefined {
  if (!baseHeaders && !nextHeaders) return undefined;
  const headers = new Headers(baseHeaders || undefined);
  const next = new Headers(nextHeaders || undefined);
  next.forEach((value, key) => headers.set(key, value));
  return headers;
}

export function createMarketDataClient(opts: { endpointBase?: string; fetch?: FetchLike; headers?: HeadersInit } = {}): MarketDataClient {
  const base = normalizeBase(opts.endpointBase ?? "");
  const fetchFn: FetchLike = opts.fetch ?? fetch;

  const RETRY_DELAYS = [500, 1000];

  function isRetryable(status: number): boolean {
    return status >= 500 && status < 600;
  }

  async function getJson<T>(path: string, qs?: URLSearchParams, init?: RequestInit): Promise<T> {
    const url = `${base}${path}${qs && qs.toString() ? `?${qs.toString()}` : ""}`;
    const requestInit: RequestInit = {
      method: "GET",
      ...init,
      headers: mergeHeaders(opts.headers, init?.headers),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
      }

      let response: Response;
      try {
        response = await fetchFn(url, requestInit);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < RETRY_DELAYS.length) {
          logSwallowed(`marketDataClient.getJson retry ${attempt + 1}/${RETRY_DELAYS.length} (network)`, err);
          continue;
        }
        throw lastError;
      }

      const text = await response.text();
      const payload = await readJsonBestEffort(text);

      if (!response.ok) {
        lastError = new Error(toErrorMessage(payload, response.status));
        if (isRetryable(response.status) && attempt < RETRY_DELAYS.length) {
          logSwallowed(`marketDataClient.getJson retry ${attempt + 1}/${RETRY_DELAYS.length} (${response.status})`, lastError);
          continue;
        }
        throw lastError;
      }

      if (isApiResponse(payload)) {
        if (!payload.ok) {
          throw new Error(toErrorMessage(payload, response.status));
        }
        return payload.data as T;
      }

      return payload as T;
    }

    throw lastError ?? new Error("getJson: unexpected retry exhaustion");
  }

  const noStore: RequestInit = { cache: "no-store" };

  const client: MarketDataClient = {
    yahoo: {
      async rss(params) {
        const qs = new URLSearchParams();
        qs.set("symbol", String(params.symbol || "").trim());
        return getJson("/api/daa/market/yahoo/rss", qs, noStore);
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
