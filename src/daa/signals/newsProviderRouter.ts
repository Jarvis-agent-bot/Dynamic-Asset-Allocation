/**
 * 新闻数据源路由器。
 * 按 market 选择最优 provider，失败时降级。
 */

import { createHash } from "node:crypto";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { RawNewsItem } from "./newsProviders";
import { finnhubNewsProvider } from "./providers/finnhubNews";
import { yahooRssNewsProvider } from "./providers/yahooRssNews";

/** 按 market 排序的 provider 优先级 */
const PROVIDER_PRIORITY: Record<string, typeof finnhubNewsProvider[]> = {
  US: [finnhubNewsProvider, yahooRssNewsProvider],
  DEFAULT: [yahooRssNewsProvider],
};

/**
 * 获取某个 symbol 的新闻，自动选择最优数据源 + 降级。
 */
export async function fetchNewsForSymbol(
  symbol: string,
  market: string,
  daysBack = 7,
): Promise<RawNewsItem[]> {
  const providers = PROVIDER_PRIORITY[market.toUpperCase()] ?? PROVIDER_PRIORITY.DEFAULT;

  for (const provider of providers) {
    try {
      const items = await provider.fetchNews(symbol, daysBack);
      if (items.length > 0) {
        return deduplicateNews(items);
      }
    } catch (e) {
      logSwallowed(`newsRouter.${provider.name}`, e);
    }
  }

  return [];
}

/**
 * 批量获取多个 symbol 的新闻（并发限制）。
 */
export async function fetchNewsBatch(
  symbols: Array<{ symbol: string; market: string }>,
  daysBack = 7,
  concurrency = 4,
): Promise<Map<string, RawNewsItem[]>> {
  const results = new Map<string, RawNewsItem[]>();

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ({ symbol, market }) => {
        const items = await fetchNewsForSymbol(symbol, market, daysBack);
        return { symbol, items };
      }),
    );
    for (const { symbol, items } of batchResults) {
      results.set(symbol, items);
    }
  }

  return results;
}

/** 按标题 hash 去重 */
function deduplicateNews(items: RawNewsItem[]): RawNewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const hash = createHash("sha1").update(item.title.toLowerCase().trim()).digest("hex").slice(0, 12);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}

/** 计算一组新闻 item 的 hash 集合（用于判断是否需要重新 LLM 分析） */
export function computeItemHashSet(items: RawNewsItem[]): string {
  const hashes = items
    .map((item) => createHash("sha1").update(item.title.toLowerCase().trim()).digest("hex").slice(0, 8))
    .sort();
  return hashes.join(",");
}
