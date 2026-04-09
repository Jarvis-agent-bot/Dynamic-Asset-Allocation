"use client";

/**
 * Agent Briefing 视图 — 显示 Cognitive Agent 的每日三类输出
 *
 * 今日意外 / 认知缺口 / 改观条件
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Brain, Eye, RefreshCw, Loader2, Zap, Search, RotateCcw } from "lucide-react";

interface Surprise {
  title: string;
  description: string;
  severityScore: number;
  suggestedAction: string;
}

interface CognitionGap {
  assetKey: string;
  portfolioWeight: number;
  daysSinceLastInvestigation: number;
  uncertaintyReason: string;
  suggestedInvestigation: string;
}

interface MindChangeCondition {
  thesisTitle: string;
  currentConviction: string;
  conditions: string[];
  monitoringIndicators: string[];
}

interface Thesis {
  id: string;
  title: string;
  thesisText: string;
  conviction: string;
  assetKeys: string[];
  updatedAt: string;
}

interface AgentStatus {
  theses: Thesis[];
  latestRun: {
    id: string;
    status: string;
    createdAt: string;
    totalTokens: number;
  } | null;
  memoryCount: number;
}

export default function AgentBriefingView() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    thesesUpdated: number;
    surprises: Surprise[];
    totalTokens: number;
    errors: string[];
  } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/daa/agent/theses");
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const triggerRun = useCallback(async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/daa/agent/run", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setRunResult(json.data);
        await loadStatus(); // 刷新状态
      }
    } catch {
      // silent
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const triggerBootstrap = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/daa/agent/bootstrap", { method: "POST" });
      if (res.ok) {
        await loadStatus();
      }
    } catch {
      // silent
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载 Agent 状态...
      </div>
    );
  }

  const theses = status?.theses ?? [];
  const hasTheses = theses.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-[var(--text)]">Agent 认知状态</h2>
          <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-xs text-[var(--muted)]">
            {theses.length} 论点 · {status?.memoryCount ?? 0} 记忆
          </span>
        </div>
        <div className="flex gap-2">
          {!hasTheses && (
            <button
              onClick={triggerBootstrap}
              disabled={running}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              初始化论点
            </button>
          )}
          <button
            onClick={triggerRun}
            disabled={running || !hasTheses}
            className="flex items-center gap-1.5 rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text)] disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            运行调查
          </button>
        </div>
      </div>

      {/* 无论点时的空状态 */}
      {!hasTheses && (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-[var(--faint)]" />
          <p className="text-sm text-[var(--muted)]">Agent 尚未初始化。</p>
          <p className="mt-1 text-xs text-[var(--faint)]">点击「初始化论点」扫描持仓并生成初始研究线索。</p>
        </div>
      )}

      {/* 运行结果（临时显示） */}
      {runResult && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-300">
            <Zap className="h-4 w-4" />
            调查完成
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-[var(--muted)]">
            <div>论点更新: <span className="text-[var(--text)]">{runResult.thesesUpdated}</span></div>
            <div>意外发现: <span className="text-[var(--text)]">{runResult.surprises.length}</span></div>
            <div>Tokens: <span className="text-[var(--text)]">{runResult.totalTokens}</span></div>
          </div>
          {runResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-amber-400">
              ⚠ {runResult.errors.length} 个错误: {runResult.errors[0]}
            </div>
          )}
        </div>
      )}

      {/* 活跃论点列表 */}
      {hasTheses && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
            <Eye className="h-3.5 w-3.5" />
            活跃研究论点
          </h3>
          <div className="space-y-2">
            {theses.map(t => {
              const daysSince = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
              const convictionColor =
                t.conviction === "high" ? "text-emerald-400" :
                t.conviction === "medium" ? "text-amber-400" :
                t.conviction === "low" ? "text-red-400" : "text-[var(--faint)]";
              const stale = daysSince > 14;

              return (
                <div
                  key={t.id}
                  className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--text)]">{t.title}</span>
                        <span className={`shrink-0 text-xs font-medium ${convictionColor}`}>
                          {t.conviction}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{t.thesisText}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-xs ${stale ? "text-amber-400" : "text-[var(--faint)]"}`}>
                        {daysSince}天前
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--faint)]">
                        {t.assetKeys.slice(0, 2).join(", ")}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 最近运行 */}
      {status?.latestRun && (
        <div className="text-xs text-[var(--faint)]">
          最近运行: {new Date(status.latestRun.createdAt).toLocaleString("zh-CN")} · {status.latestRun.status} · {status.latestRun.totalTokens} tokens
        </div>
      )}
    </div>
  );
}
