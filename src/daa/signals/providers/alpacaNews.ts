/**
 * Alpaca News REST 适配器（US 市场主源）。
 * 数据源: Benzinga（通过 Alpaca 免费层转发），覆盖 US 股票。
 * WebSocket 推送由独立 daemon 提供，这里是 REST 补齐历史/降级。
 * https://docs.alpaca.markets/reference/news
 */

import { resolveSecret } from "@/src/daa/config/secretsManager";
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

    try {
      const res = await fetch(url, {
        headers: {
          "APCA-API-KEY-ID": auth.keyId,
          "APCA-API-SECRET-KEY": auth.secret,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          logSwallowed("alpacaNews", new Error(`Alpaca ${res.status} ${res.statusText}`));
        }
        return [];
      }

      const data = await res.json() as {
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

      const items = Array.isArray(data?.news) ? data.news : [];
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
      logSwallowed("alpacaNews.fetch", e);
      return [];
    }
  },
};
