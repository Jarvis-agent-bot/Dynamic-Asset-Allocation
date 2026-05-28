"use client";

/**
 * Agent Briefing 视图 — 将日报压缩为 Today 页可执行的复核清单。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, RotateCcw, Search, Zap } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatAssetLabelByKey } from "@/src/daa/assetRegistry";

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

type ReviewTone = "amber" | "blue" | "orange" | "red" | "slate";

interface ReviewItem {
  key: string;
  label: string;
  title: string;
  detail: string;
  action?: string;
  meta?: string;
  tone: ReviewTone;
  href?: string;
  priority: number;
}

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
  if (!schedule) return "手动";
  const nextRun = computeNextRun(schedule.timesUtc);
  const modeLabel = schedule.mode === "2x_daily" ? "每日 2 次"
    : schedule.mode === "daily" ? "每日 1 次"
    : schedule.mode === "every_6h" ? "每 6 小时"
    : "手动";
  if (!nextRun) return modeLabel;
  return `${modeLabel} · 下次 ${nextRun.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} (${formatCountdown(nextRun)})`;
}

function countReviewItems(briefing: DailyBriefing | null): number {
  if (!briefing) return 0;
  return briefing.surprises.length
    + briefing.cognitionGaps.length
    + (briefing.thesisConflicts ?? []).length
    + (briefing.thesisFailureImpacts ?? []).filter((r) => r.riskLevel !== "low").length;
}

function buildReviewItems(briefing: DailyBriefing): ReviewItem[] {
  const items: ReviewItem[] = [];

  briefing.surprises.forEach((s, index) => {
    items.push({
      key: `surprise-${index}`,
      label: "新变化",
      title: s.title,
      detail: s.description,
      action: s.suggestedAction,
      meta: `重要度 ${s.severityScore}`,
      tone: s.severityScore >= 8 ? "red" : "amber",
      priority: 90 + s.severityScore,
    });
  });

  briefing.cognitionGaps.forEach((g, index) => {
    const holdingLabel = g.portfolioWeight > 0 ? `持仓 ${(g.portfolioWeight * 100).toFixed(1)}%` : "观察资产";
    items.push({
      key: `gap-${index}`,
      label: "需要复核",
      title: formatAssetLabelByKey(g.assetKey),
      detail: g.uncertaintyReason,
      action: g.suggestedInvestigation,
      meta: `${holdingLabel} · 上次复核 ${g.daysSinceLastInvestigation} 天前`,
      tone: "blue",
      priority: 70 + Math.min(g.daysSinceLastInvestigation, 30) + Math.round(g.portfolioWeight * 100),
    });
  });

  (briefing.thesisConflicts ?? []).forEach((c, index) => {
    items.push({
      key: `conflict-${index}`,
      label: "判断不一致",
      title: c.overlappingAssets.map((k) => formatAssetLabelByKey(k)).join(", ") || "同一资产",
      detail: `${c.thesisA.title} / ${c.thesisB.title}`,
      meta: `${c.thesisA.conviction} vs ${c.thesisB.conviction}`,
      tone: "orange",
      priority: 80,
    });
  });

  (briefing.thesisFailureImpacts ?? [])
    .filter((r) => r.riskLevel !== "low")
    .forEach((r, index) => {
      items.push({
        key: `risk-${index}`,
        label: "高影响",
        title: r.thesisTitle,
        detail: `相关资产：${r.affectedAssets.slice(0, 3).map((a) => formatAssetLabelByKey(a.assetKey)).join(", ")}`,
        meta: `相关持仓 ${(r.totalExposurePct * 100).toFixed(1)}%`,
        tone: r.riskLevel === "critical" ? "red" : "amber",
        href: `/daa/dashboard/today/thesis/${r.threadId}`,
        priority: 85 + Math.round(r.totalExposurePct * 100),
      });
    });

  return items.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

function toneClasses(tone: ReviewTone): string {
  if (tone === "red") return "border-red-400/22 bg-red-500/10 text-red-200";
  if (tone === "amber") return "border-amber-400/22 bg-amber-500/10 text-amber-200";
  if (tone === "blue") return "border-sky-400/22 bg-sky-500/10 text-sky-200";
  if (tone === "orange") return "border-orange-400/22 bg-orange-500/10 text-orange-200";
  return "border-[var(--border)] bg-[rgba(255,255,255,0.04)] text-[var(--muted)]";
}

function ReviewBadge({ tone, children }: { tone: ReviewTone; children: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] font-medium ${toneClasses(tone)}`}>
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
    } catch {
      // 静默失败，页面保留当前状态。
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
    } catch {
      // 静默失败，按钮状态会恢复。
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const triggerBootstrap = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/daa/agent/bootstrap", { method: "POST" });
      if (res.ok) await loadStatus();
    } catch {
      // 静默失败，按钮状态会恢复。
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const theses = status?.theses ?? [];
  const hasTheses = theses.length > 0;
  const briefing = status?.latestRun?.briefing ?? null;
  const reviewCount = countReviewItems(briefing);
  const latestRunAt = formatLatestRun(status?.latestRun?.createdAt);
  const reviewItems = useMemo(() => briefing ? buildReviewItems(briefing) : [], [briefing]);

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

  return (
    <DaaSurfacePanel
      accent="cyan"
      title="今日复核"
      subtitle="先看会影响仓位判断的事项；需要展开时直接追问 Agent。"
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
      <div className="space-y-5">
        <div className="grid gap-4 border-b border-[var(--border)] pb-4 sm:grid-cols-3">
          <SummaryStat label="待复核" value={reviewCount} hint={reviewCount > 0 ? "按影响排序" : "暂无"} />
          <SummaryStat label="本轮更新" value={briefing?.thesesUpdated ?? 0} hint={`${briefing?.memoriesCreated ?? 0} 条记忆`} />
          <SummaryStat label="最近运行" value={latestRunAt} hint={formatSchedule(status?.schedule ?? null)} />
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
          <BriefingSummary briefing={briefing} reviewItems={reviewItems} />
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

        {runResult ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
            <div className="font-medium text-[var(--text)]">调查完成：更新 {runResult.thesesUpdated} 条，发现 {runResult.surprises.length} 条需复核变化。</div>
            {runResult.errors.length > 0 ? (
              <div className="mt-1 text-amber-200">{runResult.errors.length} 个错误：{runResult.errors[0]}</div>
            ) : null}
          </div>
        ) : null}

        {status?.latestRun ? (
          <div className="text-xs leading-5 text-[var(--faint)]">
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
    <div className="min-w-0">
      <div className="text-[11px] text-[var(--faint)]">{label}</div>
      <div className="mt-1 truncate font-[var(--font-mono)] text-lg text-[var(--text)]">{value}</div>
      <div className="mt-1 truncate text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function BriefingSummary({ briefing, reviewItems }: { briefing: DailyBriefing; reviewItems: ReviewItem[] }) {
  const conditions = briefing.mindChangeConditions.slice(0, 3);

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <Search className="h-4 w-4 text-[var(--primary)]" />
          今天先看
        </div>
        {reviewItems.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {reviewItems.map((item) => (
              <ReviewRow key={item.key} item={item} />
            ))}
          </div>
        ) : (
          <div className="py-6 text-sm text-[var(--muted)]">
            当前没有需要立即复核的变化。
          </div>
        )}
      </section>

      {conditions.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            <RotateCcw className="h-4 w-4 text-[var(--amber)]" />
            什么会改变判断
          </div>
          <div className="space-y-3 border-l border-[var(--border)] pl-4">
            {conditions.map((condition, index) => (
              <div key={`${condition.thesisTitle}-${index}`} className="text-sm leading-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--text)]">{condition.thesisTitle}</span>
                  <span className="text-xs text-[var(--faint)]">{condition.currentConviction}</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  {condition.conditions.slice(0, 2).join("；")}
                </div>
                {condition.monitoringIndicators.length > 0 ? (
                  <div className="mt-1 text-[11px] text-[var(--faint)]">
                    观察：{condition.monitoringIndicators.slice(0, 4).join(" / ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReviewRow({ item }: { item: ReviewItem }) {
  const title = item.href ? (
    <Link href={item.href} className="font-medium text-[var(--text)] transition-colors hover:text-[var(--primary)]">
      {item.title}
    </Link>
  ) : (
    <span className="font-medium text-[var(--text)]">{item.title}</span>
  );

  return (
    <div className="grid gap-3 py-3 text-sm sm:grid-cols-[96px_minmax(0,1fr)]">
      <ReviewBadge tone={item.tone}>{item.label}</ReviewBadge>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          {title}
          {item.meta ? <span className="text-xs text-[var(--faint)]">{item.meta}</span> : null}
        </div>
        <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.detail}</div>
        {item.action ? (
          <div className="mt-1 text-xs leading-5 text-[var(--primary)]">{item.action}</div>
        ) : null}
      </div>
    </div>
  );
}
