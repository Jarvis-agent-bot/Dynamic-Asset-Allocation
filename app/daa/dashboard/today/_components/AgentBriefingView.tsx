"use client";

/**
 * Agent Briefing 视图 — 以三列看板呈现今日需要复核的变化、仓位缺口与论点风险。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Network, RefreshCw, RotateCcw, Search, Zap } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatAssetLabelByKey } from "@/src/daa/assetRegistry";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

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

interface ThesisFailureImpact {
  threadId: string;
  thesisTitle: string;
  conviction: string;
  affectedAssets: Array<{ assetKey: string; weightPct: number }>;
  totalExposurePct: number;
  estimatedLossPct: number;
  riskLevel: string;
}

interface ThesisConflict {
  thesisA: { id: string; title: string; conviction: string };
  thesisB: { id: string; title: string; conviction: string };
  conflictType: string;
  overlappingAssets: string[];
  severity: string;
}

interface DailyBriefing {
  surprises: Surprise[];
  cognitionGaps: CognitionGap[];
  mindChangeConditions: MindChangeCondition[];
  thesisFailureImpacts?: ThesisFailureImpact[];
  thesisConflicts?: ThesisConflict[];
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
  schedule: { mode: string; timesUtc: string[] } | null;
}

type ActionTone = "red" | "amber" | "blue" | "orange" | "slate";

const COLUMN_LIMIT = 6;

/** 计算下次 cron 运行时间（UTC timesUtc，返回最近未来的一次） */
function computeNextRun(timesUtc: string[]): Date | null {
  if (!timesUtc || timesUtc.length === 0) return null;
  const now = new Date();
  const candidates: Date[] = [];
  for (const t of timesUtc) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) continue;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    for (const dayOffset of [0, 1]) {
      const d = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset,
        h, mm, 0, 0,
      ));
      if (d.getTime() > now.getTime()) candidates.push(d);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}

function formatCountdown(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "即将运行";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const restMin = mins % 60;
  return `${hrs}h${restMin.toString().padStart(2, "0")}m`;
}

function formatLatestRun(value?: string): string {
  if (!value) return "尚未运行";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSchedule(schedule: AgentStatus["schedule"]): string {
  if (!schedule) return "手动触发";
  const nextRun = computeNextRun(schedule.timesUtc);
  const modeLabel = schedule.mode === "2x_daily" ? "每日 2 次"
    : schedule.mode === "daily" ? "每日 1 次"
    : schedule.mode === "every_6h" ? "每 6 小时"
    : "手动";
  if (!nextRun) return modeLabel;
  return `${modeLabel} · 下次 ${nextRun.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} (${formatCountdown(nextRun)})`;
}

function surpriseAction(s: Surprise): { label: string; tone: ActionTone } {
  if (s.severityScore >= 8) return { label: "立即复核", tone: "red" };
  if (s.severityScore >= 5) return { label: "评估冲击", tone: "amber" };
  return { label: "关注", tone: "slate" };
}

function gapAction(g: CognitionGap): { label: string; tone: ActionTone } {
  if (g.portfolioWeight >= 0.05) return { label: "补做研究", tone: "blue" };
  return { label: "重置观察", tone: "slate" };
}

function riskAction(r: ThesisFailureImpact): { label: string; tone: ActionTone } {
  if (r.riskLevel === "critical") return { label: "缩减暴露", tone: "red" };
  if (r.riskLevel === "high") return { label: "评估对冲", tone: "amber" };
  return { label: "保持监控", tone: "slate" };
}

function toneClasses(tone: ActionTone): string {
  if (tone === "red") return "border-red-400/22 bg-red-500/10 text-red-200";
  if (tone === "amber") return "border-amber-400/22 bg-amber-500/10 text-amber-200";
  if (tone === "blue") return "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]";
  if (tone === "orange") return "border-orange-400/22 bg-orange-500/10 text-orange-200";
  return "border-[var(--border)] bg-[var(--elevated)] text-[var(--muted)]";
}

function ActionBadge({ tone, children }: { tone: ActionTone; children: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClasses(tone)}`}>
      {children}
    </span>
  );
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
    } catch (error) {
      logSwallowed("today.agentBriefing.loadStatus", error); // 页面保留当前状态
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
        await loadStatus();
      }
    } catch (error) {
      logSwallowed("today.agentBriefing.triggerRun", error); // 按钮状态会恢复
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const triggerBootstrap = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/daa/agent/bootstrap", { method: "POST" });
      if (res.ok) await loadStatus();
    } catch (error) {
      logSwallowed("today.agentBriefing.triggerBootstrap", error); // 按钮状态会恢复
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const theses = status?.theses ?? [];
  const hasTheses = theses.length > 0;
  const briefing = status?.latestRun?.briefing ?? null;

  const sortedBuckets = useMemo(() => {
    if (!briefing) {
      return { surprises: [] as Surprise[], gaps: [] as CognitionGap[], conflicts: [] as ThesisConflict[], risks: [] as ThesisFailureImpact[] };
    }
    return {
      surprises: briefing.surprises.slice().sort((a, b) => b.severityScore - a.severityScore),
      gaps: briefing.cognitionGaps.slice().sort((a, b) => {
        const wa = a.portfolioWeight * 100 + Math.min(a.daysSinceLastInvestigation, 60) / 4;
        const wb = b.portfolioWeight * 100 + Math.min(b.daysSinceLastInvestigation, 60) / 4;
        return wb - wa;
      }),
      conflicts: (briefing.thesisConflicts ?? []).slice(),
      risks: (briefing.thesisFailureImpacts ?? []).filter((r) => r.riskLevel !== "low")
        .slice()
        .sort((a, b) => b.totalExposurePct - a.totalExposurePct),
    };
  }, [briefing]);

  if (loading) {
    return (
      <DaaSurfacePanel accent="cyan" title="今日复核">
        <div className="flex items-center justify-center py-16 text-[var(--muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载 Agent 状态...
        </div>
      </DaaSurfacePanel>
    );
  }

  const totalToReview = sortedBuckets.surprises.length + sortedBuckets.gaps.length + sortedBuckets.conflicts.length + sortedBuckets.risks.length;

  return (
    <DaaSurfacePanel
      accent="cyan"
      title="今日复核"
      subtitle="桌面看板按优先级展开：先看新变化，再处理仓位缺口与论点风险。"
      className="w-full"
      bodyClassName="px-5 py-5 sm:px-6 xl:px-7"
      action={(
        <div className="flex items-center gap-2">
          {!hasTheses ? (
            <DaaSurfaceActionButton
              tone="primary"
              className="h-8 px-2.5 text-xs"
              onClick={triggerBootstrap}
              disabled={running}
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              初始化
            </DaaSurfaceActionButton>
          ) : null}
          <DaaSurfaceActionButton
            tone="slate"
            className="h-8 px-2.5 text-xs"
            onClick={triggerRun}
            disabled={running || !hasTheses}
            title="立即刷新一次 Agent 调查"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新
          </DaaSurfaceActionButton>
        </div>
      )}
    >
      <div className="space-y-6">
        <div className="grid gap-3 border-b border-[var(--border)] pb-5 md:grid-cols-2 xl:grid-cols-4">
          <SummaryStat label="共计待复核" value={totalToReview} hint={hasTheses ? "按下方三列优先处理" : "Agent 未初始化"} />
          <SummaryStat label="新变化" value={sortedBuckets.surprises.length} hint={sortedBuckets.surprises.filter((s) => s.severityScore >= 8).length > 0 ? `${sortedBuckets.surprises.filter((s) => s.severityScore >= 8).length} 条高重要度` : "暂无紧急"} />
          <SummaryStat label="仓位缺口" value={sortedBuckets.gaps.length} hint={sortedBuckets.gaps.filter((g) => g.portfolioWeight >= 0.05).length > 0 ? `${sortedBuckets.gaps.filter((g) => g.portfolioWeight >= 0.05).length} 条高权重` : "全部已复核"} />
          <SummaryStat label="最近运行" value={formatLatestRun(status?.latestRun?.createdAt)} hint={formatSchedule(status?.schedule ?? null)} />
        </div>

        {!hasTheses ? (
          <DaaSurfaceEmptyState
            title="Agent 尚未初始化"
            description="先基于持仓生成研究线索，之后这里会只显示需要你复核的事项。"
            action={(
              <DaaSurfaceActionButton tone="primary" onClick={triggerBootstrap} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                初始化
              </DaaSurfaceActionButton>
            )}
          />
        ) : briefing ? (
          <BriefingKanban buckets={sortedBuckets} />
        ) : (
          <DaaSurfaceEmptyState
            title="还没有今日复核结果"
            description="刷新一次后，页面会汇总最需要处理的变化和复核项。"
            action={(
              <DaaSurfaceActionButton tone="primary" onClick={triggerRun} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新
              </DaaSurfaceActionButton>
            )}
          />
        )}

        {briefing && briefing.mindChangeConditions.length > 0 ? (
          <MindChangeSection conditions={briefing.mindChangeConditions} />
        ) : null}

        {runResult ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
            <div className="font-medium text-[var(--text)]">调查完成：更新 {runResult.thesesUpdated} 条，发现 {runResult.surprises.length} 条需复核变化。</div>
            {runResult.errors.length > 0 ? (
              <div className="mt-1 text-amber-200">{runResult.errors.length} 个错误：{runResult.errors[0]}</div>
            ) : null}
          </div>
        ) : null}

        {status?.latestRun ? (
          <div className="text-xs leading-5 text-[var(--muted)]">
            状态 {status.latestRun.status} · {status.latestRun.totalTokens} tokens
            {briefing?.estimatedCost ? ` · $${briefing.estimatedCost.toFixed(4)}` : ""}
            {status.memoryCount > 0 ? (
              <>
                {" · "}
                <Link href="/daa/dashboard/today/memories" className="text-[var(--muted)] transition-colors hover:text-[var(--primary)]">
                  {status.memoryCount} 条记忆
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </DaaSurfacePanel>
  );
}

function SummaryStat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 truncate font-[var(--font-mono)] text-xl leading-7 text-[var(--text)]">{value}</div>
      <div className="mt-1 truncate text-xs leading-5 text-[var(--muted)]">{hint}</div>
    </div>
  );
}

interface BriefingBuckets {
  surprises: Surprise[];
  gaps: CognitionGap[];
  conflicts: ThesisConflict[];
  risks: ThesisFailureImpact[];
}

function BriefingKanban({ buckets }: { buckets: BriefingBuckets }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.08fr_1fr_1fr]">
      <KanbanColumn
        icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}
        title="新变化"
        subtitle="市场或新闻和现有论点冲突的事项"
        count={buckets.surprises.length}
        emptyText="今天没有出现明显的认知冲击"
      >
        {buckets.surprises.slice(0, COLUMN_LIMIT).map((s, i) => (
          <SurpriseCard key={`s-${i}`} surprise={s} />
        ))}
      </KanbanColumn>

      <KanbanColumn
        icon={<Search className="h-4 w-4 text-[var(--primary)]" />}
        title="仓位缺口"
        subtitle="重要持仓但近期没有调查"
        count={buckets.gaps.length}
        emptyText="所有重要持仓均在近期复核窗口内"
      >
        {buckets.gaps.slice(0, COLUMN_LIMIT).map((g, i) => (
          <GapCard key={`g-${i}`} gap={g} />
        ))}
      </KanbanColumn>

      <KanbanColumn
        icon={<Network className="h-4 w-4 text-orange-300" />}
        title="论点冲突 · 风险"
        subtitle="同资产矛盾论点 + 高暴露风险"
        count={buckets.conflicts.length + buckets.risks.length}
        emptyText="论点之间无冲突，风险暴露可控"
      >
        {buckets.conflicts.slice(0, 2).map((c, i) => (
          <ConflictCard key={`c-${i}`} conflict={c} />
        ))}
        {buckets.risks.slice(0, COLUMN_LIMIT - Math.min(buckets.conflicts.length, 2)).map((r, i) => (
          <RiskCard key={`r-${i}`} risk={r} />
        ))}
      </KanbanColumn>
    </div>
  );
}

function KanbanColumn({
  icon,
  title,
  subtitle,
  count,
  emptyText,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.flat().some(Boolean) : Boolean(children);
  return (
    <section className="flex min-w-0 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[inset_0_1px_0_var(--surface)]">
      <header className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
            {icon}
            {title}
            <span className="rounded-full bg-[var(--elevated)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">{count}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{subtitle}</div>
        </div>
      </header>
      <div className="flex flex-col gap-2.5 p-3">
        {hasChildren ? children : (
          <div className="px-2 py-6 text-center text-xs text-[var(--muted)]">{emptyText}</div>
        )}
        {count > COLUMN_LIMIT ? (
          <div className="px-2 pt-1 text-xs text-[var(--muted)]">
            另有 {count - COLUMN_LIMIT} 条未显示
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CardShell({
  action,
  meta,
  title,
  detail,
  hint,
  href,
}: {
  action: { label: string; tone: ActionTone };
  meta?: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
}) {
  const titleNode = href ? (
    <Link href={href} className="font-medium text-[var(--text)] transition-colors hover:text-[var(--primary)]">
      {title}
    </Link>
  ) : (
    <span className="font-medium text-[var(--text)]">{title}</span>
  );

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--elevated)]/55 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <ActionBadge tone={action.tone}>{action.label}</ActionBadge>
        {meta ? <span className="truncate text-[11px] text-[var(--muted)]">{meta}</span> : null}
      </div>
      <div className="mt-2 text-sm leading-5">{titleNode}</div>
      {detail ? <div className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[var(--muted)]">{detail}</div> : null}
      {hint ? <div className="mt-1.5 text-[13px] leading-5 text-[var(--primary)]">{hint}</div> : null}
    </div>
  );
}

function SurpriseCard({ surprise }: { surprise: Surprise }) {
  return (
    <CardShell
      action={surpriseAction(surprise)}
      meta={`重要度 ${surprise.severityScore}`}
      title={surprise.title}
      detail={surprise.description}
      hint={surprise.suggestedAction}
    />
  );
}

function GapCard({ gap }: { gap: CognitionGap }) {
  const weightLabel = gap.portfolioWeight > 0
    ? `持仓 ${(gap.portfolioWeight * 100).toFixed(1)}% · 上次复核 ${gap.daysSinceLastInvestigation} 天前`
    : `观察资产 · 上次复核 ${gap.daysSinceLastInvestigation} 天前`;
  return (
    <CardShell
      action={gapAction(gap)}
      meta={weightLabel}
      title={formatAssetLabelByKey(gap.assetKey)}
      detail={gap.uncertaintyReason}
      hint={gap.suggestedInvestigation}
    />
  );
}

function ConflictCard({ conflict }: { conflict: ThesisConflict }) {
  const title = conflict.overlappingAssets.length > 0
    ? conflict.overlappingAssets.map((k) => formatAssetLabelByKey(k)).join("、")
    : "同一资产";
  return (
    <CardShell
      action={{ label: "对齐论点", tone: "orange" }}
      meta={`${conflict.thesisA.conviction} vs ${conflict.thesisB.conviction}`}
      title={title}
      detail={`${conflict.thesisA.title} / ${conflict.thesisB.title}`}
    />
  );
}

function RiskCard({ risk }: { risk: ThesisFailureImpact }) {
  const assetSummary = risk.affectedAssets.slice(0, 3).map((a) => formatAssetLabelByKey(a.assetKey)).join("、");
  const moreCount = risk.affectedAssets.length > 3 ? risk.affectedAssets.length - 3 : 0;
  return (
    <CardShell
      action={riskAction(risk)}
      meta={`暴露 ${(risk.totalExposurePct * 100).toFixed(1)}% · 预估损失 ${(risk.estimatedLossPct * 100).toFixed(1)}%`}
      title={risk.thesisTitle}
      detail={moreCount > 0 ? `${assetSummary} 等 ${moreCount + 3} 个资产` : assetSummary}
      href={`/daa/dashboard/today/thesis/${risk.threadId}`}
    />
  );
}

function MindChangeSection({ conditions }: { conditions: MindChangeCondition[] }) {
  const top = conditions.slice(0, 3);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
        <RotateCcw className="h-4 w-4 text-amber-300" />
        什么会改变判断
      </div>
      <div className="space-y-3 border-l border-[var(--border)] pl-4">
        {top.map((condition, index) => (
          <div key={`${condition.thesisTitle}-${index}`} className="text-sm leading-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[var(--text)]">{condition.thesisTitle}</span>
              <span className="text-xs text-[var(--muted)]">{condition.currentConviction}</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {condition.conditions.slice(0, 2).join("；")}
            </div>
            {condition.monitoringIndicators.length > 0 ? (
              <div className="mt-1 text-xs text-[var(--muted)]">
                观察：{condition.monitoringIndicators.slice(0, 4).join(" / ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
