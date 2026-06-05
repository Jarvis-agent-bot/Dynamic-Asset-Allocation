"use client";

/**
 * 今日决策队列 — 把 Agent 内部 briefing 翻译成投资者今天要处理的事项。
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

type RunResultSummary = {
  thesesUpdated: number;
  surprisesCount: number;
  totalTokens: number;
  errors: string[];
  autopilot: boolean;
};

type ActionTone = "red" | "amber" | "blue" | "orange" | "slate";
type ReviewIntent = "decide" | "confirm" | "investigate" | "monitor";

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
  if (s.severityScore >= 8) return { label: "需要决策", tone: "red" };
  if (s.severityScore >= 5) return { label: "需要确认", tone: "amber" };
  return { label: "继续观察", tone: "slate" };
}

function gapAction(g: CognitionGap): { label: string; tone: ActionTone } {
  if (g.portfolioWeight >= 0.05) return { label: "重新看一眼", tone: "blue" };
  return { label: "排队观察", tone: "slate" };
}

function riskAction(r: ThesisFailureImpact): { label: string; tone: ActionTone } {
  if (r.riskLevel === "critical") return { label: "需要决策", tone: "red" };
  if (r.riskLevel === "high") return { label: "检查仓位", tone: "amber" };
  return { label: "持续观察", tone: "slate" };
}

function intentTone(intent: ReviewIntent): ActionTone {
  if (intent === "decide") return "red";
  if (intent === "confirm") return "amber";
  if (intent === "investigate") return "blue";
  return "slate";
}

function intentLabel(intent: ReviewIntent): string {
  if (intent === "decide") return "今天要决定";
  if (intent === "confirm") return "需要确认";
  if (intent === "investigate") return "重新调查";
  return "后台观察";
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

function normalizeRunResult(value: unknown): RunResultSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as {
    autopilot?: unknown;
    thesesUpdated?: unknown;
    surprises?: unknown;
    totalTokens?: unknown;
    errors?: unknown;
    cognitiveRun?: {
      thesesUpdated?: unknown;
      surprisesCount?: unknown;
      totalTokens?: unknown;
      errors?: unknown;
    };
  };
  if (data.autopilot === true && data.cognitiveRun && typeof data.cognitiveRun === "object") {
    return {
      thesesUpdated: Number(data.cognitiveRun.thesesUpdated ?? 0) || 0,
      surprisesCount: Number(data.cognitiveRun.surprisesCount ?? 0) || 0,
      totalTokens: Number(data.cognitiveRun.totalTokens ?? 0) || 0,
      errors: Array.isArray(data.cognitiveRun.errors) ? data.cognitiveRun.errors.map(String) : [],
      autopilot: true,
    };
  }
  return {
    thesesUpdated: Number(data.thesesUpdated ?? 0) || 0,
    surprisesCount: Array.isArray(data.surprises) ? data.surprises.length : 0,
    totalTokens: Number(data.totalTokens ?? 0) || 0,
    errors: Array.isArray(data.errors) ? data.errors.map(String) : [],
    autopilot: false,
  };
}

export default function AgentBriefingView() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResultSummary | null>(null);

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
        setRunResult(normalizeRunResult(json.data));
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

  const sortedBuckets = useMemo<BriefingBuckets>(() => {
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

  const reviewQueue = useMemo(() => buildReviewQueue(sortedBuckets), [sortedBuckets]);

  if (loading) {
    return (
      <DaaSurfacePanel accent="cyan" title="今日决策队列">
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
      title="今日决策队列"
      subtitle="只展示今天需要人判断的事项；后台关系和内部诊断放到明细里。"
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
          <SummaryStat label="今天要不要动" value={reviewQueue.decisionCount} hint={reviewQueue.decisionCount > 0 ? "需要确认仓位或目标权重" : "暂无必须决策"} />
          <SummaryStat label="需要确认" value={reviewQueue.confirmCount} hint={reviewQueue.confirmCount > 0 ? "有变化，但未必马上交易" : "暂无新变化"} />
          <SummaryStat label="等 Agent 调查" value={reviewQueue.investigateCount} hint={reviewQueue.importantInvestigationCount > 0 ? `${reviewQueue.importantInvestigationCount} 个重要持仓` : "低优先级后台排队"} />
          <SummaryStat label="最近运行" value={formatLatestRun(status?.latestRun?.createdAt)} hint={formatSchedule(status?.schedule ?? null)} />
        </div>

        {!hasTheses ? (
          <DaaSurfaceEmptyState
            title="Agent 尚未初始化"
            description="先基于持仓生成初始判断，之后这里会只显示今天需要你判断的事项。"
            action={(
              <DaaSurfaceActionButton tone="primary" onClick={triggerBootstrap} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                初始化
              </DaaSurfaceActionButton>
            )}
          />
        ) : briefing ? (
          <DecisionQueueView queue={reviewQueue} buckets={sortedBuckets} />
        ) : (
          <DaaSurfaceEmptyState
            title="还没有今日决策队列"
            description="刷新一次后，页面会汇总今天最值得你判断的持仓变化。"
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
            <div className="font-medium text-[var(--text)]">
              {runResult.autopilot ? "自动驾驶检查完成" : "调查完成"}：更新 {runResult.thesesUpdated} 条投资判断，发现 {runResult.surprisesCount} 条需要确认的变化。
            </div>
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

type HumanReviewItem = {
  key: string;
  intent: ReviewIntent;
  title: React.ReactNode;
  why: React.ReactNode;
  nextStep: React.ReactNode;
  evidence: string;
  score: number;
  href?: string;
};

type ReviewQueue = {
  items: HumanReviewItem[];
  topItems: HumanReviewItem[];
  decisionCount: number;
  confirmCount: number;
  investigateCount: number;
  monitorCount: number;
  importantInvestigationCount: number;
  diagnosticsCount: number;
};

function buildReviewQueue(buckets: BriefingBuckets): ReviewQueue {
  const surpriseItems: HumanReviewItem[] = buckets.surprises.map((surprise, index) => {
    const intent: ReviewIntent = surprise.severityScore >= 8 ? "decide" : surprise.severityScore >= 5 ? "confirm" : "monitor";
    return {
      key: `surprise-${index}`,
      intent,
      title: surprise.title,
      why: surprise.description,
      nextStep: surprise.suggestedAction || "继续观察，等 Agent 收集更多证据。",
      evidence: `新变化 · 重要度 ${surprise.severityScore}`,
      score: surprise.severityScore * 12,
    };
  });

  const gapItems: HumanReviewItem[] = buckets.gaps.map((gap, index) => {
    const weightPct = gap.portfolioWeight * 100;
    const isImportant = gap.portfolioWeight >= 0.05;
    return {
      key: `gap-${gap.assetKey}-${index}`,
      intent: isImportant ? "investigate" : "monitor",
      title: formatAssetLabelByKey(gap.assetKey),
      why: gap.uncertaintyReason,
      nextStep: gap.suggestedInvestigation || "让 Agent 排队补做一次轻量调查。",
      evidence: weightPct > 0
        ? `持仓 ${weightPct.toFixed(1)}% · 上次有效调查 ${gap.daysSinceLastInvestigation} 天前`
        : `观察名单 · 上次有效调查 ${gap.daysSinceLastInvestigation} 天前`,
      score: weightPct * 4 + Math.min(gap.daysSinceLastInvestigation, 90),
    };
  });

  const riskItems: HumanReviewItem[] = buckets.risks.map((risk) => {
    const riskBoost = risk.riskLevel === "critical" ? 80 : risk.riskLevel === "high" ? 55 : 25;
    const affectedAssets = risk.affectedAssets.slice(0, 3).map((a) => formatAssetLabelByKey(a.assetKey)).join("、");
    return {
      key: `risk-${risk.threadId}`,
      intent: risk.riskLevel === "critical" || risk.riskLevel === "high" ? "decide" : "confirm",
      title: risk.thesisTitle,
      why: `如果这个判断错了，会影响 ${affectedAssets}`,
      nextStep: risk.riskLevel === "critical" || risk.riskLevel === "high"
        ? "确认是否需要调整目标权重、减少集中暴露，或要求 Agent 做深度复核。"
        : "保持观察；如果相关资产继续扩大偏离，再升级为决策事项。",
      evidence: `判断风险 · 暴露 ${(risk.totalExposurePct * 100).toFixed(1)}% · 情景损失 ${(risk.estimatedLossPct * 100).toFixed(1)}%`,
      score: risk.totalExposurePct * 100 + risk.estimatedLossPct * 120 + riskBoost,
      href: `/daa/dashboard/today/thesis/${risk.threadId}`,
    };
  });

  const items = [...surpriseItems, ...gapItems, ...riskItems].sort((a, b) => b.score - a.score);
  return {
    items,
    topItems: items.slice(0, 5),
    decisionCount: items.filter((item) => item.intent === "decide").length,
    confirmCount: items.filter((item) => item.intent === "confirm").length,
    investigateCount: items.filter((item) => item.intent === "investigate").length,
    monitorCount: items.filter((item) => item.intent === "monitor").length,
    importantInvestigationCount: buckets.gaps.filter((gap) => gap.portfolioWeight >= 0.05).length,
    diagnosticsCount: buckets.conflicts.length,
  };
}

function DecisionQueueView({ queue, buckets }: { queue: ReviewQueue; buckets: BriefingBuckets }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const decisionText = queue.decisionCount > 0
    ? `${queue.decisionCount} 条需要你判断是否调整仓位`
    : "今天没有必须动仓位的事项";
  const detailCount = queue.items.length;

  return (
    <div className="space-y-4">
      {queue.topItems.length > 0 ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--primary-border)] bg-[var(--primary-bg)]/55 px-4 py-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">今天先处理</div>
              <div className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{decisionText}；其余交给 Agent 排队。</div>
            </div>
            <span className="rounded-full border border-[var(--primary-border)] bg-[var(--surface)] px-2.5 py-1 font-[var(--font-mono)] text-xs text-[var(--primary)]">
              Top {queue.topItems.length}
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-5">
            {queue.topItems.map((item) => (
              <HumanReviewCard key={item.key} item={item} />
            ))}
          </div>
        </section>
      ) : (
        <DaaSurfaceEmptyState
          title="今天没有需要人处理的事项"
          description="Agent 没有发现需要你确认、决策或要求重新调查的重要持仓。"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <ReviewLogicDisclosure />
        <div className="flex flex-wrap items-center gap-3">
          {queue.diagnosticsCount > 0 ? (
            <span className="text-xs text-[var(--faint)]">后台诊断 {queue.diagnosticsCount} 条判断关系</span>
          ) : null}
          {detailCount + queue.diagnosticsCount > 0 ? (
            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              className="rounded-full border border-[var(--border)] bg-[var(--elevated)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              {detailsOpen ? "收起明细" : detailCount > 0 ? `查看 ${detailCount} 条队列明细` : "查看后台诊断"}
            </button>
          ) : null}
        </div>
      </div>

      {detailsOpen ? <BriefingDetailColumns buckets={buckets} /> : null}
    </div>
  );
}

function HumanReviewCard({ item }: { item: HumanReviewItem }) {
  const titleNode = item.href ? (
    <Link href={item.href} className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--text)] transition-colors hover:text-[var(--primary)]">
      {item.title}
    </Link>
  ) : (
    <div className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--text)]">{item.title}</div>
  );

  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 shadow-[inset_0_1px_0_var(--surface)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <ActionBadge tone={intentTone(item.intent)}>{intentLabel(item.intent)}</ActionBadge>
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{Math.round(item.score)}</span>
      </div>
      {titleNode}
      <div className="mt-2 space-y-2 text-xs leading-5">
        <div>
          <div className="font-medium text-[var(--text)]">为什么出现</div>
          <div className="line-clamp-2 text-[var(--muted)]">{item.why}</div>
        </div>
        <div>
          <div className="font-medium text-[var(--text)]">建议下一步</div>
          <div className="line-clamp-2 text-[var(--muted)]">{item.nextStep}</div>
        </div>
      </div>
      <div className="mt-auto pt-2 text-[11px] text-[var(--faint)]">{item.evidence}</div>
    </div>
  );
}

function ReviewLogicDisclosure() {
  return (
    <details className="group max-w-3xl text-xs leading-5 text-[var(--muted)]">
      <summary className="cursor-pointer list-none font-medium text-[var(--text)] transition-colors hover:text-[var(--primary)]">
        “等 Agent 调查”怎么算？
        <span className="ml-2 text-[var(--faint)] group-open:hidden">展开</span>
        <span className="ml-2 hidden text-[var(--faint)] group-open:inline">收起</span>
      </summary>
      <div className="mt-1">
        它不是你有没有打开页面，而是 Agent 最近有没有对该持仓相关判断完成有效调查。
        重要持仓超过 7 天没有新证据，或判断仍不明确，就会进入队列；下次调查到有效证据后会自动重置。
      </div>
    </details>
  );
}

function BriefingDetailColumns({ buckets }: { buckets: BriefingBuckets }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.08fr_1fr_1fr]">
      <KanbanColumn
        icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}
        title="需要确认的新变化"
        subtitle="新闻、市场数据或价格变化让原判断需要人确认"
        count={buckets.surprises.length}
        emptyText="今天没有明显影响持仓的新变化"
      >
        {buckets.surprises.slice(0, COLUMN_LIMIT).map((s, i) => (
          <SurpriseCard key={`s-${i}`} surprise={s} />
        ))}
      </KanbanColumn>

      <KanbanColumn
        icon={<Search className="h-4 w-4 text-[var(--primary)]" />}
        title="等待 Agent 调查"
        subtitle="这些持仓最近没有留下有效新证据"
        count={buckets.gaps.length}
        emptyText="重要持仓近期都调查过"
      >
        {buckets.gaps.slice(0, COLUMN_LIMIT).map((g, i) => (
          <GapCard key={`g-${i}`} gap={g} />
        ))}
      </KanbanColumn>

      <KanbanColumn
        icon={<Network className="h-4 w-4 text-orange-300" />}
        title="后台诊断"
        subtitle="判断关系和高暴露风险，不直接等同于人的待办"
        count={buckets.conflicts.length + buckets.risks.length}
        emptyText="当前没有后台诊断事项"
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
    ? `持仓 ${(gap.portfolioWeight * 100).toFixed(1)}% · 上次有效调查 ${gap.daysSinceLastInvestigation} 天前`
    : `观察资产 · 上次有效调查 ${gap.daysSinceLastInvestigation} 天前`;
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
      action={{ label: "判断打架", tone: "orange" }}
      meta={`方向不同：${conflict.thesisA.conviction} vs ${conflict.thesisB.conviction}`}
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
      meta={`暴露 ${(risk.totalExposurePct * 100).toFixed(1)}% · 情景损失 ${(risk.estimatedLossPct * 100).toFixed(1)}%`}
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
