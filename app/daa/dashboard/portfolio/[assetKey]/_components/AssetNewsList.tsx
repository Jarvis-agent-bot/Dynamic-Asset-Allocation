"use client";

/**
 * 资产新闻列表 — 专用于 /portfolio/[assetKey] 页。
 * 读 /api/daa/news/recent?symbol=XXX&hours=168，展示过去 7 天该资产的新闻。
 */

import { useCallback, useEffect, useState } from "react";
import { Newspaper, Loader2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

interface NewsItem {
  symbol: string;
  title: string;
  link: string | null;
  publishedAt: string;
  provider: string;
  signalSummary: string | null;
  majorEvent: { type: string; impact: string; description: string } | null;
  scorePct: number | null;
}

interface AssetNewsResponse { items: NewsItem[]; hours: number; limit: number; }

function formatAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms) || ms < 0) return "刚刚";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}m 前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h 前`;
  return `${Math.floor(hrs / 24)}d 前`;
}

function providerBadge(provider: string): { label: string; color: string } {
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === "alpaca") return { label: "Alpaca", color: "text-[var(--success)] bg-[var(--success-bg)]" };
  if (normalizedProvider === "yahoo_rss") return { label: "Yahoo", color: "text-[var(--primary)] bg-[var(--primary-bg)]" };
  return { label: provider, color: "text-[var(--muted)] bg-[var(--elevated)]" };
}

export function AssetNewsList({ symbol }: { symbol: string }) {
  const [newsFeed, setNewsFeed] = useState<AssetNewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const response = await fetch(`/api/daa/news/recent?symbol=${encodeURIComponent(symbol)}&hours=168&limit=30`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jsonPayload = await response.json();
      setNewsFeed(jsonPayload.data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => { void load(false); }, [load]);

  const items = newsFeed?.items ?? [];
  const summary = items[0]?.signalSummary ?? null;

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text)]">市场资讯</h3>
          <span className="text-[10px] text-[var(--faint)]">{items.length} 条</span>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[10px] text-[var(--muted)] hover:bg-[var(--elevated)] hover:text-[var(--text)] disabled:opacity-50"
          aria-label="刷新"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>

      {/* 整体情感摘要 */}
      {summary && (
        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
          {summary}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载新闻…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--amber)]">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--faint)]">
          近 7 天无新闻
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="max-h-[360px] divide-y divide-[var(--elevated)] overflow-y-auto">
          {items.map((newsItem, index) => {
            const badge = providerBadge(newsItem.provider);
            const isMajor = newsItem.majorEvent?.impact === "high";
            return (
              <li key={`${index}-${newsItem.publishedAt}`} className="py-2">
                <div className="flex items-start gap-2">
                  {isMajor && (
                    <span
                      className="mt-0.5 shrink-0 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-1 py-0.5 text-[9px] font-medium text-[var(--danger)]"
                      title={newsItem.majorEvent?.description ?? ""}
                    >
                      重大
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {newsItem.link ? (
                      <a
                        href={newsItem.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 flex items-start gap-1 text-xs text-[var(--text)] hover:text-[var(--primary)]"
                      >
                        {newsItem.title}
                        <ExternalLink className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-40" />
                      </a>
                    ) : (
                      <span className="line-clamp-2 text-xs text-[var(--text)]">{newsItem.title}</span>
                    )}
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--faint)]">
                      <span className={`rounded px-1 py-0.5 ${badge.color}`}>{badge.label}</span>
                      <span>{formatAgo(newsItem.publishedAt)}</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
