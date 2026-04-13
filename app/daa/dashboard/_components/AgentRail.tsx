"use client";

/**
 * Agent Rail — 全站常驻侧边面板
 *
 * 显示 Cognitive Agent 的认知状态：
 * - 当前关注的论点
 * - 最近的意外发现
 * - 待复盘项
 * - Agent 最近想法
 *
 * 根据当前页面上下文动态调整显示内容。
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Brain, ChevronRight, Eye, Loader2, RotateCcw, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Thesis {
  id: string;
  title: string;
  thesisText: string;
  conviction: string;
  assetKeys: string[];
  updatedAt: string;
  priorityScore: number;
}

interface AgentRailData {
  theses: Thesis[];
  latestRun: { id: string; status: string; createdAt: string; totalTokens: number } | null;
  memoryCount: number;
}

const CONVICTION_COLORS: Record<string, string> = {
  high: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-red-500/20 text-red-400",
  uncertain: "bg-zinc-500/20 text-zinc-400",
};

export default function AgentRail() {
  const pathname = usePathname() || "";
  const [data, setData] = useState<AgentRailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/daa/agent/theses");
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Agent 页面本身不需要 Rail（信息重复）
  if (pathname.startsWith("/daa/dashboard/today")) return null;

  // 没有 thesis 时不显示
  if (!loading && (!data?.theses || data.theses.length === 0)) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105"
        title="展开 Agent Rail"
      >
        <Brain className="h-4 w-4" />
      </button>
    );
  }

  // 根据当前页面过滤相关 thesis
  const isPortfolio = pathname.startsWith("/daa/dashboard/portfolio");
  const isRebalance = pathname.startsWith("/daa/dashboard/rebalance");
  const theses = data?.theses ?? [];

  // Portfolio 页：按 conviction 排序
  // Rebalance 页：按 priority 排序，高 conviction 优先
  const sortedTheses = [...theses].sort((a, b) => {
    const convOrder: Record<string, number> = { high: 0, medium: 1, low: 2, uncertain: 3 };
    if (isRebalance) return b.priorityScore - a.priorityScore;
    return (convOrder[a.conviction] ?? 9) - (convOrder[b.conviction] ?? 9);
  });

  // 找到待复盘的 thesis
  const dueForReview = theses.filter(t => {
    const daysSince = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
    return daysSince > 14;
  });

  return (
    <aside className="daa-scrollbar fixed right-0 top-0 z-30 hidden h-screen w-[280px] shrink-0 overflow-y-auto border-l border-[rgba(255,255,255,0.06)] bg-[rgba(6,10,18,0.85)] backdrop-blur-sm xl:block">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-[var(--text)]">Agent</span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-[var(--faint)]" />}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded p-1 text-[var(--faint)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--muted)]"
          title="收起"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 当前关注 */}
      <div className="border-b border-[rgba(255,255,255,0.04)] px-4 py-3">
        <div className="mb-2 flex items-center gap-1 text-xs font-medium text-[var(--faint)]">
          <Eye className="h-3 w-3" />
          {isRebalance ? "调仓相关论点" : "当前关注"}
        </div>
        <div className="space-y-1.5">
          {sortedTheses.slice(0, 5).map(t => (
            <div key={t.id} className="group rounded-md px-2 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-1.5">
                <span className={cn("shrink-0 rounded px-1 py-0.5 text-[10px] font-medium", CONVICTION_COLORS[t.conviction] ?? CONVICTION_COLORS.uncertain)}>
                  {t.conviction}
                </span>
                <Link href={`/daa/dashboard/today/thesis/${t.id}`} className="min-w-0 flex-1 truncate text-xs text-[var(--text)] hover:text-indigo-400 transition-colors">
                  {t.title}
                </Link>
              </div>
              <p className="mt-0.5 line-clamp-1 pl-[calc(1rem+6px)] text-[10px] text-[var(--faint)]">
                {t.assetKeys.slice(0, 3).join(", ")}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 待复盘 */}
      {dueForReview.length > 0 && (
        <div className="border-b border-[rgba(255,255,255,0.04)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-400/80">
            <RotateCcw className="h-3 w-3" />
            待复盘 ({dueForReview.length})
          </div>
          {dueForReview.slice(0, 3).map(t => {
            const days = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
            return (
              <div key={t.id} className="mb-1 flex items-center justify-between text-xs">
                <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{t.title}</span>
                <span className="shrink-0 text-amber-400/60">{days}天</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 元数据 */}
      <div className="px-4 py-3 text-[10px] text-[var(--faint)]">
        <div className="flex justify-between">
          <span>论点: {theses.length}</span>
          <span>记忆: {data?.memoryCount ?? 0}</span>
        </div>
        {data?.latestRun && (
          <div className="mt-1">
            上次运行: {new Date(data.latestRun.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
    </aside>
  );
}
