/**
 * Finnhub 新闻数据适配器。
 * 免费版: 60 次/分钟，美股个股新闻。
 * https://finnhub.io/docs/api/company-news
 */

import { resolveSecret } from "@/src/daa/config/secretsManager";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { NewsProvider, RawNewsItem } from "../newsProviders";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export const finnhubNewsProvider: NewsProvider = {
  name: "finnhub",
  supportedMarkets: ["US"],

  async fetchNews(symbol: string, daysBack = 7): Promise<RawNewsItem[]> {
    const apiKey = await resolveSecret("finnhub_api_key");
    if (!apiKey) return [];

    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

    const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${apiKey}`;

    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        if (res.status === 429) logSwallowed("finnhubNews", new Error("Finnhub 429 rate limited"));
        return [];
      }

      const data = await res.json() as Array<{
        category?: string;
        datetime?: number;
        headline?: string;
        id?: number;
        image?: string;
        related?: string;
        source?: string;
        summary?: string;
        url?: string;
      }>;

      if (!Array.isArray(data)) return [];

      return data
        .filter((item) => item.headline && item.datetime)
        .slice(0, 20)
        .map((item) => ({
          title: item.headline!,
          summary: item.summary || undefined,
          link: item.url || undefined,
          publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : undefined,
          source: item.source || "Finnhub",
          symbols: item.related ? item.related.split(",").map((s) => s.trim()).filter(Boolean) : [symbol],
          provider: "finnhub",
        }));
    } catch (e) {
      logSwallowed("finnhubNews.fetch", e);
      return [];
    }
  },
};
