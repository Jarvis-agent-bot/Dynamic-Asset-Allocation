import { appendDaaExternalRequestLog } from "@/src/daa/store/jobStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { MARKET_DATA_USER_AGENT } from "@/src/market/constants";
import type {
  MarketDataJsonResult,
  MarketDataProvider,
  MarketDataRequestContext,
} from "@/src/market/marketDataProvider";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type YahooProviderOptions = {
  fetchFn?: FetchLike;
  logRequest?: typeof appendDaaExternalRequestLog;
  minRequestGapMs?: number;
  rateLimitCooldownMs?: number;
  now?: () => number;
};

type YahooRequestOptions = {
  url: URL;
  context: MarketDataRequestContext;
  timeoutMs: number;
  retryCount: number;
  headers?: Record<string, string>;
  acceptedStatus?: (status: number) => boolean;
};

type YahooJsonRequestOptions = {
  candidates: URL[];
  context: MarketDataRequestContext;
  timeoutMs: number;
  withCrumb?: boolean;
};

type CookieState = {
  jar: Map<string, string>;
  crumb: string;
  crumbExpiresAt: number;
};

export class YahooProviderError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly endpointHost: string;
  readonly url: string;
  readonly bodyPreview: string;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    status: number;
    errorCode: string;
    endpointHost: string;
    url: string;
    bodyPreview?: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "YahooProviderError";
    this.status = input.status;
    this.errorCode = input.errorCode;
    this.endpointHost = input.endpointHost;
    this.url = input.url;
    this.bodyPreview = input.bodyPreview ?? "";
    this.retryable = input.retryable ?? false;
  }
}

const DEFAULT_TIMEOUT_MS_ = 8_000;
const DEFAULT_MIN_REQUEST_GAP_MS_ = 350;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS_ = 20_000;
const CRUMB_TTL_MS_ = 6 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNestedRecord(value: unknown, key: string): Record<string, unknown> {
  return isRecord(value) && isRecord(value[key]) ? value[key] : {};
}

function readYahooError(payload: unknown): { code: string; message: string } | null {
  const chart = readNestedRecord(payload, "chart");
  const chartError = isRecord(chart.error) ? chart.error : null;
  if (chartError) {
    return {
      code: typeof chartError.code === "string" ? chartError.code : "chart_error",
      message: typeof chartError.description === "string" ? chartError.description : "Yahoo chart error",
    };
  }

  const quoteSummary = readNestedRecord(payload, "quoteSummary");
  const quoteError = isRecord(quoteSummary.error) ? quoteSummary.error : null;
  if (quoteError) {
    return {
      code: typeof quoteError.code === "string" ? quoteError.code : "quote_summary_error",
      message: typeof quoteError.description === "string" ? quoteError.description : "Yahoo quoteSummary error",
    };
  }

  const finance = readNestedRecord(payload, "finance");
  const financeError = isRecord(finance.error) ? finance.error : null;
  if (financeError) {
    return {
      code: typeof financeError.code === "string" ? financeError.code : "finance_error",
      message: typeof financeError.description === "string" ? financeError.description : "Yahoo finance error",
    };
  }

  return null;
}

function classifyYahooHttpError(status: number, text: string): { code: string; message: string; retryable: boolean } {
  const lower = text.toLowerCase();
  if (status === 429) return { code: "rate_limited", message: "Yahoo rate limited this client", retryable: true };
  if (status === 401 && lower.includes("crumb")) return { code: "invalid_crumb", message: "Yahoo crumb is invalid or expired", retryable: true };
  if (status === 401) return { code: "unauthorized", message: "Yahoo request unauthorized", retryable: true };
  if (status === 403) return { code: "region_blocked", message: "Yahoo request forbidden, likely region or anti-abuse block", retryable: false };
  if (status >= 500) return { code: `http_${status}`, message: "Yahoo upstream server error", retryable: true };
  return { code: `http_${status}`, message: "Yahoo upstream request failed", retryable: false };
}

function splitSetCookieHeader(raw: string): string[] {
  return raw.split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function readSetCookie(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }
  const raw = headers.get("set-cookie");
  return raw ? splitSetCookieHeader(raw) : [];
}

function updateCookieJar(jar: Map<string, string>, headers: Headers): void {
  for (const cookie of readSetCookie(headers)) {
    const firstPart = cookie.split(";")[0]?.trim() ?? "";
    const eqIndex = firstPart.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = firstPart.slice(0, eqIndex).trim();
    const value = firstPart.slice(eqIndex + 1).trim();
    if (!name || !value) continue;
    jar.set(name, value);
  }
}

function buildCookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function buildQueryHosts(path: string, symbol: string): URL[] {
  return [
    new URL(`https://query2.finance.yahoo.com${path}${encodeURIComponent(symbol)}`),
    new URL(`https://query1.finance.yahoo.com${path}${encodeURIComponent(symbol)}`),
  ];
}

function buildQueryHostUrls(path: string): URL[] {
  return [
    new URL(`https://query2.finance.yahoo.com${path}`),
    new URL(`https://query1.finance.yahoo.com${path}`),
  ];
}

function readBodyPreview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 500);
}

export function createYahooProvider(opts: YahooProviderOptions = {}): MarketDataProvider {
  const fetchFn = opts.fetchFn ?? fetch;
  const logRequest = opts.logRequest ?? appendDaaExternalRequestLog;
  const minRequestGapMs = Math.max(0, Math.trunc(opts.minRequestGapMs ?? DEFAULT_MIN_REQUEST_GAP_MS_));
  const rateLimitCooldownMs = Math.max(0, Math.trunc(opts.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS_));
  const now = opts.now ?? (() => Date.now());
  const cookieState: CookieState = {
    jar: new Map(),
    crumb: "",
    crumbExpiresAt: 0,
  };
  let nextRequestAt = 0;

  async function applyRateLimit(): Promise<void> {
    const waitMs = nextRequestAt - now();
    if (waitMs > 0) await sleep(waitMs);
  }

  function markRequest(status: number): void {
    const baseNext = now() + minRequestGapMs;
    nextRequestAt = Math.max(nextRequestAt, baseNext);
    if (status === 429) {
      nextRequestAt = Math.max(nextRequestAt, now() + rateLimitCooldownMs);
    }
  }

  async function recordRequest(input: {
    context: MarketDataRequestContext;
    endpointHost: string;
    status: number;
    errorCode?: string;
    errorMessage?: string;
    latencyMs: number;
    retryCount: number;
  }): Promise<void> {
    try {
      await logRequest({
        provider: "yahoo",
        resource: input.context.resource,
        subjectKey: input.context.subjectKey ?? "",
        endpointHost: input.endpointHost,
        httpStatus: input.status,
        errorCode: input.errorCode ?? "",
        errorMessage: input.errorMessage ?? "",
        latencyMs: input.latencyMs,
        retryCount: input.retryCount,
        cacheStatus: input.context.cacheStatus ?? "",
        caller: input.context.caller ?? "",
      });
    } catch (err) {
      logSwallowed("yahooProvider.recordRequest", err);
    }
  }

  async function requestText(input: YahooRequestOptions): Promise<{
    url: string;
    endpointHost: string;
    status: number;
    headers: Record<string, string>;
    text: string;
    latencyMs: number;
  }> {
    const endpointHost = input.url.hostname;
    const urlText = input.url.toString();
    await applyRateLimit();

    const startedAt = now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);
    let response: Response | null = null;
    let text = "";
    let errorCode = "";
    let errorMessage = "";
    let shouldRecordError = false;
    try {
      response = await fetchFn(input.url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "application/json,text/plain,*/*",
          "user-agent": MARKET_DATA_USER_AGENT,
          ...input.headers,
        },
      });
      updateCookieJar(cookieState.jar, response.headers);
      text = await response.text();
      const accepted = input.acceptedStatus ? input.acceptedStatus(response.status) : response.ok;
      if (!accepted) {
        const classified = classifyYahooHttpError(response.status, text);
        errorCode = classified.code;
        errorMessage = classified.message;
        throw new YahooProviderError({
          message: `${classified.message} (${response.status})`,
          status: response.status,
          errorCode: classified.code,
          endpointHost,
          url: urlText,
          bodyPreview: readBodyPreview(text),
          retryable: classified.retryable,
        });
      }

      return {
        url: urlText,
        endpointHost,
        status: response.status,
        headers: extractHeaders(response.headers),
        text,
        latencyMs: Math.max(0, now() - startedAt),
      };
    } catch (err) {
      shouldRecordError = true;
      if (err instanceof YahooProviderError) {
        errorCode = errorCode || err.errorCode;
        errorMessage = errorMessage || err.message;
        throw err;
      }
      const isAbort = err instanceof Error && err.name === "AbortError";
      errorCode = isAbort ? "timeout" : "network_error";
      errorMessage = err instanceof Error ? err.message : String(err);
      throw new YahooProviderError({
        message: errorMessage,
        status: response?.status ?? 0,
        errorCode,
        endpointHost,
        url: urlText,
        bodyPreview: readBodyPreview(text),
        retryable: true,
      });
    } finally {
      clearTimeout(timeoutId);
      const status = response?.status ?? 0;
      markRequest(status);
      if (shouldRecordError) {
        await recordRequest({
          context: input.context,
          endpointHost,
          status,
          errorCode,
          errorMessage,
          latencyMs: Math.max(0, now() - startedAt),
          retryCount: input.retryCount,
        });
      }
    }
  }

  async function requestJsonOnce(input: YahooRequestOptions): Promise<MarketDataJsonResult> {
    const result = await requestText(input);
    let payloadJson: unknown;
    try {
      payloadJson = JSON.parse(result.text) as unknown;
    } catch (err) {
      await recordRequest({
        context: input.context,
        endpointHost: result.endpointHost,
        status: result.status,
        errorCode: "bad_json",
        errorMessage: "Yahoo returned non-JSON payload",
        latencyMs: result.latencyMs,
        retryCount: input.retryCount,
      });
      throw new YahooProviderError({
        message: "Yahoo returned non-JSON payload",
        status: result.status,
        errorCode: "bad_json",
        endpointHost: result.endpointHost,
        url: result.url,
        bodyPreview: readBodyPreview(result.text),
        retryable: false,
      });
    }

    const payloadError = readYahooError(payloadJson);
    if (payloadError) {
      await recordRequest({
        context: input.context,
        endpointHost: result.endpointHost,
        status: result.status,
        errorCode: payloadError.code,
        errorMessage: payloadError.message,
        latencyMs: result.latencyMs,
        retryCount: input.retryCount,
      });
      throw new YahooProviderError({
        message: payloadError.message,
        status: result.status,
        errorCode: payloadError.code,
        endpointHost: result.endpointHost,
        url: result.url,
        bodyPreview: readBodyPreview(result.text),
        retryable: false,
      });
    }

    await recordRequest({
      context: input.context,
      endpointHost: result.endpointHost,
      status: result.status,
      latencyMs: result.latencyMs,
      retryCount: input.retryCount,
    });

    return {
      provider: "yahoo",
      resource: input.context.resource,
      subjectKey: input.context.subjectKey ?? "",
      endpointHost: result.endpointHost,
      url: result.url,
      status: result.status,
      retryCount: input.retryCount,
      responseHeaders: result.headers,
      payloadText: result.text,
      payloadJson,
    };
  }

  async function fetchCookieSeed(context: MarketDataRequestContext, timeoutMs: number): Promise<void> {
    const result = await requestText({
      url: new URL("https://fc.yahoo.com"),
      context: {
        ...context,
        resource: "yahoo.cookie",
      },
      timeoutMs,
      retryCount: 0,
      acceptedStatus: (status) => status >= 200 && status < 500,
    });
    await recordRequest({
      context: {
        ...context,
        resource: "yahoo.cookie",
      },
      endpointHost: result.endpointHost,
      status: result.status,
      errorCode: result.status >= 200 && result.status < 400 ? "" : `http_${result.status}`,
      errorMessage: result.status >= 200 && result.status < 400 ? "" : "Yahoo cookie seed returned non-2xx status",
      latencyMs: result.latencyMs,
      retryCount: 0,
    });
  }

  async function ensureCrumb(context: MarketDataRequestContext, timeoutMs: number, forceRefresh = false): Promise<string> {
    if (!forceRefresh && cookieState.crumb && cookieState.crumbExpiresAt > now()) {
      return cookieState.crumb;
    }

    if (forceRefresh) {
      cookieState.crumb = "";
      cookieState.crumbExpiresAt = 0;
    }

    if (cookieState.jar.size === 0 || forceRefresh) {
      await fetchCookieSeed(context, timeoutMs);
    }

    const cookieHeader = buildCookieHeader(cookieState.jar);
    const result = await requestText({
      url: new URL("https://query2.finance.yahoo.com/v1/test/getcrumb"),
      context: {
        ...context,
        resource: "yahoo.crumb",
      },
      timeoutMs,
      retryCount: 0,
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    const crumb = result.text.trim();
    if (!crumb || crumb.startsWith("{") || /\s/.test(crumb)) {
      await recordRequest({
        context: {
          ...context,
          resource: "yahoo.crumb",
        },
        endpointHost: result.endpointHost,
        status: result.status,
        errorCode: "invalid_crumb_response",
        errorMessage: "Yahoo crumb response is invalid",
        latencyMs: result.latencyMs,
        retryCount: 0,
      });
      throw new YahooProviderError({
        message: "Yahoo crumb response is invalid",
        status: result.status,
        errorCode: "invalid_crumb_response",
        endpointHost: result.endpointHost,
        url: result.url,
        bodyPreview: readBodyPreview(result.text),
        retryable: true,
      });
    }
    await recordRequest({
      context: {
        ...context,
        resource: "yahoo.crumb",
      },
      endpointHost: result.endpointHost,
      status: result.status,
      latencyMs: result.latencyMs,
      retryCount: 0,
    });
    cookieState.crumb = crumb;
    cookieState.crumbExpiresAt = now() + CRUMB_TTL_MS_;
    return crumb;
  }

  async function requestJsonWithFallback(input: YahooJsonRequestOptions): Promise<MarketDataJsonResult> {
    let lastError: YahooProviderError | null = null;
    let retryCount = 0;

    for (const originalCandidate of input.candidates) {
      const candidate = new URL(originalCandidate.toString());
      let forceCrumbRefresh = false;
      for (let crumbAttempt = 0; crumbAttempt < (input.withCrumb ? 2 : 1); crumbAttempt += 1) {
        try {
          const headers: Record<string, string> = {};
          if (input.withCrumb) {
            const crumb = await ensureCrumb(input.context, input.timeoutMs, forceCrumbRefresh);
            candidate.searchParams.set("crumb", crumb);
            const cookieHeader = buildCookieHeader(cookieState.jar);
            if (cookieHeader) headers.cookie = cookieHeader;
          }
          return await requestJsonOnce({
            url: candidate,
            context: input.context,
            timeoutMs: input.timeoutMs,
            retryCount,
            headers,
          });
        } catch (err) {
          const yahooError = err instanceof YahooProviderError
            ? err
            : new YahooProviderError({
              message: err instanceof Error ? err.message : String(err),
              status: 0,
              errorCode: "unknown_error",
              endpointHost: candidate.hostname,
              url: candidate.toString(),
              retryable: true,
            });
          lastError = yahooError;
          if (input.withCrumb && yahooError.errorCode === "invalid_crumb" && crumbAttempt === 0) {
            forceCrumbRefresh = true;
            retryCount += 1;
            continue;
          }
          if (!yahooError.retryable) {
            throw yahooError;
          }
          break;
        }
      }
      retryCount += 1;
    }

    throw lastError ?? new YahooProviderError({
      message: "Yahoo request failed before any endpoint was attempted",
      status: 0,
      errorCode: "request_not_attempted",
      endpointHost: "",
      url: "",
      retryable: true,
    });
  }

  return {
    async fetchChart(params) {
      const symbol = params.symbol.trim().toUpperCase();
      const candidates = buildQueryHosts("/v8/finance/chart/", symbol);
      for (const candidate of candidates) {
        candidate.searchParams.set("interval", params.interval ?? "1d");
        candidate.searchParams.set("events", params.events ?? "div|split");
        if (params.range) candidate.searchParams.set("range", params.range);
        if (Number.isFinite(params.period1)) candidate.searchParams.set("period1", String(params.period1));
        if (Number.isFinite(params.period2)) candidate.searchParams.set("period2", String(params.period2));
      }
      return requestJsonWithFallback({
        candidates,
        context: {
          resource: "yahoo.chart",
          subjectKey: symbol,
          ...params.context,
        },
        timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS_,
      });
    },

    async fetchFundamentalsTimeseries(params) {
      const symbol = params.symbol.trim().toUpperCase();
      const candidates = buildQueryHosts("/ws/fundamentals-timeseries/v1/finance/timeseries/", symbol);
      for (const candidate of candidates) {
        candidate.searchParams.set("symbol", symbol);
        candidate.searchParams.set("type", params.types.join(","));
        candidate.searchParams.set("period1", String(params.period1));
        candidate.searchParams.set("period2", String(params.period2));
      }
      return requestJsonWithFallback({
        candidates,
        context: {
          resource: "yahoo.fundamentals_timeseries",
          subjectKey: symbol,
          ...params.context,
        },
        timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS_,
      });
    },

    async fetchQuoteSummary(params) {
      const symbol = params.symbol.trim().toUpperCase();
      const modules = typeof params.modules === "string" ? params.modules : params.modules.join(",");
      const candidates = buildQueryHosts("/v10/finance/quoteSummary/", symbol);
      for (const candidate of candidates) {
        candidate.searchParams.set("modules", modules);
      }
      return requestJsonWithFallback({
        candidates,
        context: {
          resource: "yahoo.quote_summary",
          subjectKey: symbol,
          ...params.context,
        },
        timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS_,
        withCrumb: true,
      });
    },

    async fetchSearch(params) {
      const query = params.query.trim();
      const candidates = buildQueryHostUrls("/v1/finance/search");
      for (const candidate of candidates) {
        candidate.searchParams.set("q", query);
        candidate.searchParams.set("quotesCount", String(Math.max(1, Math.min(100, Math.trunc(params.quotesCount ?? 10)))));
        candidate.searchParams.set("newsCount", String(Math.max(0, Math.min(50, Math.trunc(params.newsCount ?? 0)))));
        candidate.searchParams.set("enableFuzzyQuery", params.enableFuzzyQuery === false ? "false" : "true");
      }
      return requestJsonWithFallback({
        candidates,
        context: {
          resource: "yahoo.search",
          subjectKey: query,
          ...params.context,
        },
        timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS_,
      });
    },
  };
}

let yahooProviderSingleton: MarketDataProvider | null = null;

export function getYahooProvider(): MarketDataProvider {
  yahooProviderSingleton ??= createYahooProvider();
  return yahooProviderSingleton;
}
