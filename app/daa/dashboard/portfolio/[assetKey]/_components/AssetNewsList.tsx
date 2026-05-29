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

interface Response { items: NewsItem[]; hours: number; limit: number; }

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
  const p = provider.toLowerCase();
  if (p === "alpaca") return { label: "Alpaca", color: "text-emerald-700 bg-emerald-50" };
  if (p === "yahoo_rss") return { label: "Yahoo", color: "text-sky-700 bg-sky-50" };
  return { label: provider, color: "text-slate-600 bg-slate-100" };
}

export function AssetNewsList({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/daa/news/recent?symbol=${encodeURIComponent(symbol)}&hours=168&limit=30`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => { void load(false); }, [load]);

  const items = data?.items ?? [];
  const summary = items[0]?.signalSummary ?? null;

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-slate-900">市场资讯</h3>
          <span className="text-[10px] text-slate-400">{items.length} 条</span>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          aria-label="刷新"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>

      {/* 整体情感摘要 */}
      {summary && (
        <div className="mb-3 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          {summary}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载新闻…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-4 text-center text-[11px] text-[var(--faint)]">
          近 7 天无新闻
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
          {items.map((it, idx) => {
            const badge = providerBadge(it.provider);
            const isMajor = it.majorEvent?.impact === "high";
            return (
              <li key={`${idx}-${it.publishedAt}`} className="py-2">
                <div className="flex items-start gap-2">
                  {isMajor && (
                    <span
                      className="mt-0.5 shrink-0 rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium text-red-700"
                      title={it.majorEvent?.description ?? ""}
                    >
                      重大
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {it.link ? (
                      <a
                        href={it.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 flex items-start gap-1 text-xs text-slate-800 hover:text-[var(--primary)]"
                      >
                        {it.title}
                        <ExternalLink className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-40" />
                      </a>
                    ) : (
                      <span className="line-clamp-2 text-xs text-slate-800">{it.title}</span>
                    )}
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className={`rounded px-1 py-0.5 ${badge.color}`}>{badge.label}</span>
                      <span>{formatAgo(it.publishedAt)}</span>
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
