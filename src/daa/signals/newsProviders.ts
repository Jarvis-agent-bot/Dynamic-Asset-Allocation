/**
 * 新闻数据源统一接口。
 * 所有新闻 provider（Finnhub、Yahoo RSS 等）都实现此接口。
 */

export type RawNewsItem = {
  title: string;
  summary?: string;
  link?: string;
  publishedAt?: string;
  source?: string;
  symbols?: string[];
  /** Provider 名称（自动填充） */
  provider?: string;
};

export interface NewsProvider {
  name: string;
  supportedMarkets: string[];
  fetchNews(symbol: string, daysBack?: number): Promise<RawNewsItem[]>;
}

/** 来源可信度评分（0-1） */
export function sourceCredibility(source: string | undefined): number {
  const s = String(source || "").toLowerCase();
  if (/sec\.gov|hkex|sse\.com|szse\.com/.test(s)) return 1.0;
  if (/reuters|bloomberg|wsj|ft\.com|cnbc/.test(s)) return 0.9;
  if (/yahoo|marketwatch|investing\.com|benzinga|finnhub/.test(s)) return 0.78;
  if (/seekingalpha|motleyfool|barrons/.test(s)) return 0.72;
  return 0.65;
}
