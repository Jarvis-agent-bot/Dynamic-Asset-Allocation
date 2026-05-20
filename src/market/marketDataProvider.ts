export type MarketDataProviderName = "yahoo";

export type MarketDataProviderCacheStatus =
  | "cache_hit"
  | "cache_miss"
  | "cache_bypass"
  | "cache_stale"
  | "refresh_failed_stale"
  | "external_fetch";

export type MarketDataRequestContext = {
  resource: string;
  subjectKey?: string;
  caller?: string;
  cacheStatus?: MarketDataProviderCacheStatus | string;
};

export type MarketDataJsonResult = {
  provider: MarketDataProviderName;
  resource: string;
  subjectKey: string;
  endpointHost: string;
  url: string;
  status: number;
  retryCount: number;
  responseHeaders: Record<string, string>;
  payloadText: string;
  payloadJson: unknown;
};

export type MarketDataProvider = {
  fetchChart(params: {
    symbol: string;
    interval?: string;
    range?: string;
    period1?: number;
    period2?: number;
    events?: string;
    timeoutMs?: number;
    context?: Omit<MarketDataRequestContext, "resource" | "subjectKey">;
  }): Promise<MarketDataJsonResult>;
  fetchFundamentalsTimeseries(params: {
    symbol: string;
    types: readonly string[];
    period1: number;
    period2: number;
    timeoutMs?: number;
    context?: Omit<MarketDataRequestContext, "resource" | "subjectKey">;
  }): Promise<MarketDataJsonResult>;
  fetchQuoteSummary(params: {
    symbol: string;
    modules: readonly string[] | string;
    timeoutMs?: number;
    context?: Omit<MarketDataRequestContext, "resource" | "subjectKey">;
  }): Promise<MarketDataJsonResult>;
  fetchQuoteBatch(params: {
    symbols: readonly string[];
    timeoutMs?: number;
    context?: Omit<MarketDataRequestContext, "resource" | "subjectKey">;
  }): Promise<MarketDataJsonResult>;
  fetchSearch(params: {
    query: string;
    quotesCount?: number;
    newsCount?: number;
    enableFuzzyQuery?: boolean;
    timeoutMs?: number;
    context?: Omit<MarketDataRequestContext, "resource" | "subjectKey">;
  }): Promise<MarketDataJsonResult>;
};
