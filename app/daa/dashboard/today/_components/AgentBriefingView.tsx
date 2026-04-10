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

interface DailyBriefing {
  surprises: Surprise[];
  cognitionGaps: CognitionGap[];
  mindChangeConditions: MindChangeCondition[];
  thesesUpdated: number;
  memoriesCreated: number;
  totalTokens: number;
  estimatedCost: number;
}

interface AgentStatus {
  theses: Thesis[];
  latestRun: {
    id: string;
    status: string;
    createdAt: string;
    totalTokens: number;
    briefing: DailyBriefing | null;
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
  const briefing = status?.latestRun?.briefing ?? null;

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

      {/* 日报三大板块 */}
      {briefing && <BriefingPanels briefing={briefing} />}

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
          {briefing?.estimatedCost ? ` · $${briefing.estimatedCost.toFixed(4)}` : ""}
        </div>
      )}
    </div>
  );
}

// ── 日报三大板块组件 ──

function BriefingPanels({ briefing }: { briefing: DailyBriefing }) {
  const hasSurprises = briefing.surprises.length > 0;
  const hasGaps = briefing.cognitionGaps.length > 0;
  const hasConditions = briefing.mindChangeConditions.length > 0;

  if (!hasSurprises && !hasGaps && !hasConditions) return null;

  return (
    <div className="space-y-3">
      {/* 今日意外 */}
      {hasSurprises && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-300">
            <Zap className="h-3.5 w-3.5" />
            今日意外
          </h3>
          <div className="space-y-2">
            {briefing.surprises.slice(0, 5).map((s, i) => (
              <div key={i} className="text-xs">
                <div className="flex items-center gap-2">
                  <SeverityBadge score={s.severityScore} />
                  <span className="font-medium text-[var(--text)]">{s.title}</span>
                </div>
                <p className="mt-0.5 pl-7 text-[var(--muted)]">{s.description}</p>
                {s.suggestedAction && (
                  <p className="mt-0.5 pl-7 text-amber-400/80">→ {s.suggestedAction}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 认知缺口 */}
      {hasGaps && (
        <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-blue-300">
            <Search className="h-3.5 w-3.5" />
            认知缺口
          </h3>
          <div className="space-y-2">
            {briefing.cognitionGaps.slice(0, 5).map((g, i) => (
              <div key={i} className="flex items-start justify-between text-xs">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--text)]">{g.assetKey}</span>
                  <span className="ml-2 text-[var(--faint)]">权重 {(g.portfolioWeight * 100).toFixed(1)}%</span>
                  <p className="mt-0.5 text-[var(--muted)]">{g.uncertaintyReason}</p>
                  {g.suggestedInvestigation && (
                    <p className="mt-0.5 text-blue-400/80">→ {g.suggestedInvestigation}</p>
                  )}
                </div>
                <span className="ml-2 shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-400">
                  {g.daysSinceLastInvestigation}天未查
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 改观条件 */}
      {hasConditions && (
        <div className="rounded-xl border border-purple-500/15 bg-purple-500/5 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-purple-300">
            <RotateCcw className="h-3.5 w-3.5" />
            改观条件
          </h3>
          <div className="space-y-2">
            {briefing.mindChangeConditions.slice(0, 5).map((m, i) => {
              const convColor =
                m.currentConviction === "high" ? "text-emerald-400" :
                m.currentConviction === "medium" ? "text-amber-400" :
                m.currentConviction === "low" ? "text-red-400" : "text-[var(--faint)]";
              return (
                <div key={i} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text)]">{m.thesisTitle}</span>
                    <span className={`text-[10px] font-medium ${convColor}`}>{m.currentConviction}</span>
                  </div>
                  <ul className="mt-0.5 list-inside list-disc pl-2 text-[var(--muted)]">
                    {m.conditions.slice(0, 3).map((c, j) => <li key={j}>{c}</li>)}
                  </ul>
                  {m.monitoringIndicators.length > 0 && (
                    <div className="mt-0.5 pl-2 text-[var(--faint)]">
                      监控: {m.monitoringIndicators.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ score }: { score: number }) {
  const bg = score >= 8 ? "bg-red-500/20 text-red-400" :
    score >= 5 ? "bg-amber-500/20 text-amber-400" :
    "bg-blue-500/20 text-blue-400";
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${bg}`}>
      {score}
    </span>
  );
}
