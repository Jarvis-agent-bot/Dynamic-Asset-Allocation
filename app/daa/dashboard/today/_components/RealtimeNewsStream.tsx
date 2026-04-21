"use client";

/**
 * 实时新闻流 — 过去 24 小时命中持仓/watchlist 的新闻。
 * 数据源: daa_news_item_snapshot_v1（含 Alpaca WS 秒级推送 + Yahoo RSS 30min 拉取）
 */

import { useCallback, useEffect, useState } from "react";
import { Newspaper, AlertCircle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { getAssetDisplayName } from "@/src/daa/assetRegistry";

interface NewsItem {
  symbol: string;
  title: string;
  link: string | null;
  publishedAt: string;
  provider: string;
  freshness: number;
  sourceCredibility: number;
  signalSummary: string | null;
  majorEvent: { type: string; impact: string; description: string } | null;
  scorePct: number | null;
}

interface Response {
  items: NewsItem[];
  watchedSymbols: string[];
  hours: number;
  limit: number;
}

function formatAgo(publishedAt: string): string {
  const ageMs = Date.now() - Date.parse(publishedAt);
  if (!isFinite(ageMs) || ageMs < 0) return "刚刚";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}m 前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h 前`;
  const days = Math.floor(hrs / 24);
  return `${days}d 前`;
}

function providerBadge(provider: string): { label: string; color: string } {
  const p = provider.toLowerCase();
  if (p === "alpaca") return { label: "Alpaca WS", color: "text-emerald-300 bg-emerald-500/10" };
  if (p === "yahoo_rss") return { label: "Yahoo", color: "text-sky-300 bg-sky-500/10" };
  if (p === "multi") return { label: "聚合", color: "text-[var(--muted)] bg-[rgba(255,255,255,0.06)]" };
  return { label: provider, color: "text-[var(--muted)] bg-[rgba(255,255,255,0.06)]" };
}

function impactColor(impact: string): string {
  if (impact === "high") return "text-red-300 bg-red-500/15";
  if (impact === "medium") return "text-amber-300 bg-amber-500/15";
  return "text-[var(--muted)] bg-[rgba(255,255,255,0.06)]";
}

export default function RealtimeNewsStream() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/daa/news/recent?hours=24&limit=30", { cache: "no-store" });
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
  }, []);

  useEffect(() => { void load(false); }, [load]);

  // 每 90 秒轻量刷新（让 WS 推送来的新闻自动出现）
  useEffect(() => {
    const t = setInterval(() => { void load(true); }, 90_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-6 text-center text-sm text-[var(--muted)]">
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
        加载实时新闻…
      </div>
    );
  }

  const items = data?.items ?? [];
  const highImpactCount = items.filter(i => i.majorEvent?.impact === "high").length;

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-sky-300" />
          <h3 className="text-sm font-medium text-[var(--text)]">实时新闻流</h3>
          <span className="text-[10px] text-[var(--faint)]">
            过去 24h · 命中 {data?.watchedSymbols.length ?? 0} 个关注资产
          </span>
          {highImpactCount > 0 && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
              {highImpactCount} 条重大
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--faint)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50"
          aria-label="刷新"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          刷新
        </button>
      </div>

      {error && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--faint)]">
          24 小时内暂无命中持仓的新闻
        </div>
      ) : (
        <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
          {items.map((it, idx) => {
            const badge = providerBadge(it.provider);
            const isMajor = it.majorEvent?.impact === "high";
            return (
              <li key={`${it.symbol}-${idx}-${it.publishedAt}`} className="py-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-[var(--faint)]">
                    <span
                      className="font-mono text-[11px] font-medium text-[var(--text)]"
                      title={getAssetDisplayName(it.symbol) ?? it.symbol}
                    >
                      {getAssetDisplayName(it.symbol) ?? it.symbol}
                    </span>
                    <span>{formatAgo(it.publishedAt)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      {isMajor && (
                        <span
                          className={`mt-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${impactColor("high")}`}
                          title={it.majorEvent?.description ?? ""}
                        >
                          重大 · {it.majorEvent?.type}
                        </span>
                      )}
                      {it.link ? (
                        <a
                          href={it.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--text)] hover:text-indigo-400 line-clamp-2 flex items-start gap-1"
                        >
                          {it.title}
                          <ExternalLink className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-40" />
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--text)] line-clamp-2">{it.title}</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`rounded px-1 py-0.5 text-[9px] ${badge.color}`}>
                        {badge.label}
                      </span>
                      {it.scorePct != null && (
                        <span className="text-[10px] text-[var(--faint)]">
                          情感 {Math.round(it.scorePct)}
                        </span>
                      )}
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
