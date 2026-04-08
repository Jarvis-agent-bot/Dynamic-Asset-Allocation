/**
 * Yahoo RSS 新闻数据适配器（降级备选）。
 * 复用现有 yahooRssFetch.ts。
 */

import { fetchYahooRssFeedBySymbol } from "@/src/market/yahooRssFetch";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { NewsProvider, RawNewsItem } from "../newsProviders";

export const yahooRssNewsProvider: NewsProvider = {
  name: "yahoo_rss",
  supportedMarkets: ["*"],  // 全球市场（但质量因市场而异）

  async fetchNews(symbol: string, _daysBack = 7): Promise<RawNewsItem[]> {
    try {
      const result = await fetchYahooRssFeedBySymbol(symbol, 20);
      return result.items
        .filter((item) => item.title)
        .map((item) => ({
          title: item.title,
          summary: item.summary || undefined,
          link: item.link || undefined,
          publishedAt: item.pubDate || undefined,
          source: "Yahoo Finance",
          symbols: [symbol],
          provider: "yahoo_rss",
        }));
    } catch (e) {
      logSwallowed("yahooRssNews.fetch", e);
      return [];
    }
  },
};
