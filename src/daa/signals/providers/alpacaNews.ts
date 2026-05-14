/**
 * Alpaca News REST 适配器（US 市场主源）。
 * 数据源: Benzinga（通过 Alpaca 免费层转发），覆盖 US 股票。
 * WebSocket 推送由独立 daemon 提供，这里是 REST 补齐历史/降级。
 * https://docs.alpaca.markets/reference/news
 */

import { resolveSecret } from "@/src/daa/config/secretsManager";
import { appendDaaExternalRequestLog } from "@/src/daa/store/jobStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { NewsProvider, RawNewsItem } from "../newsProviders";

const ALPACA_DATA_BASE = "https://data.alpaca.markets/v1beta1";

async function resolveAlpacaAuth(): Promise<{ keyId: string; secret: string } | null> {
  const [keyId, secret] = await Promise.all([
    resolveSecret("alpaca_api_key_id"),
    resolveSecret("alpaca_api_secret_key"),
  ]);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

async function recordAlpacaNewsRequest(input: {
  symbol: string;
  status: number;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
}): Promise<void> {
  try {
    await appendDaaExternalRequestLog({
      provider: "alpaca",
      resource: "alpaca.news",
      subjectKey: input.symbol.trim().toUpperCase(),
      endpointHost: "data.alpaca.markets",
      httpStatus: input.status,
      errorCode: input.errorCode ?? "",
      errorMessage: input.errorMessage ?? "",
      latencyMs: input.latencyMs,
      retryCount: 0,
      cacheStatus: "cache_bypass",
      caller: "alpacaNewsProvider.fetchNews",
    });
  } catch (err) {
    logSwallowed("alpacaNews.recordRequest", err);
  }
}

export const alpacaNewsProvider: NewsProvider = {
  name: "alpaca",
  supportedMarkets: ["US"],

  async fetchNews(symbol: string, daysBack = 7): Promise<RawNewsItem[]> {
    const auth = await resolveAlpacaAuth();
    if (!auth) return [];

    const end = new Date().toISOString();
    const start = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    const params = new URLSearchParams({
      symbols: symbol,
      start,
      end,
      sort: "desc",
      limit: "20",
      include_content: "false",
      exclude_contentless: "true",
    });
    const url = `${ALPACA_DATA_BASE}/news?${params.toString()}`;
    const startedAt = Date.now();

    try {
      const res = await fetch(url, {
        headers: {
          "APCA-API-KEY-ID": auth.keyId,
          "APCA-API-SECRET-KEY": auth.secret,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      const status = Number(res.status) || (res.ok ? 200 : 0);

      if (!res.ok) {
        await recordAlpacaNewsRequest({
          symbol,
          status,
          errorCode: `http_${status}`,
          errorMessage: status === 429 ? "Alpaca rate limited this client" : "Alpaca upstream request failed",
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
        if (res.status === 403 || res.status === 429) {
          logSwallowed("alpacaNews", new Error(`Alpaca ${res.status} ${res.statusText}`));
        }
        return [];
      }

      let data: {
        news?: Array<{
          id?: number;
          headline?: string;
          summary?: string;
          author?: string;
          created_at?: string;
          updated_at?: string;
          url?: string;
          symbols?: string[];
          source?: string;
        }>;
      };
      try {
        data = await res.json() as {
          news?: Array<{
            id?: number;
            headline?: string;
            summary?: string;
            author?: string;
            created_at?: string;
            updated_at?: string;
            url?: string;
            symbols?: string[];
            source?: string;
          }>;
        };
      } catch (err) {
        await recordAlpacaNewsRequest({
          symbol,
          status,
          errorCode: "bad_json",
          errorMessage: "Alpaca returned non-JSON payload",
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
        logSwallowed("alpacaNews.parsePayload", err);
        return [];
      }

      const items = Array.isArray(data?.news) ? data.news : [];
      await recordAlpacaNewsRequest({
        symbol,
        status,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      return items
        .filter((it) => it.headline && it.created_at)
        .map((it) => ({
          title: it.headline!,
          summary: it.summary || undefined,
          link: it.url || undefined,
          publishedAt: it.created_at,
          source: it.source || "benzinga",
          symbols: Array.isArray(it.symbols) && it.symbols.length > 0 ? it.symbols : [symbol],
          provider: "alpaca",
        }));
    } catch (e) {
      await recordAlpacaNewsRequest({
        symbol,
        status: 0,
        errorCode: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network_error",
        errorMessage: e instanceof Error ? e.message : String(e),
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      logSwallowed("alpacaNews.fetch", e);
      return [];
    }
  },
};
