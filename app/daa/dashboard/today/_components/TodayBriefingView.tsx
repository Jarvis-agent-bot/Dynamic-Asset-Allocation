"use client";

/**
 * 今日结论 — 把后台复核 briefing 翻译成投资者可以拍板的组合动作。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Network, RefreshCw, RotateCcw, Search, ShieldCheck, Zap } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  buildDailyReviewBrief,
  type DailyReviewBrief,
  type StrategyOverlay,
} from "@/app/daa/dashboard/today/_components/dailyReviewBrief";
import { formatAssetLabelByKey } from "@/src/daa/assetRegistry";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

interface MarketEventReview {
  title: string;
  description: string;
  relatedThesisId?: string | null;
  severityScore: number;
  suggestedAction: string;
}

interface InvestigationNeed {
  assetKey: string;
  sourceThesisId?: string | null;
  sourceThesisTitle?: string | null;
  portfolioWeight: number;
  daysSinceLastInvestigation: number;
  lastInvestigatedAt?: string | null;
  reviewStatus?: string;
  uncertaintyReason: string;
  suggestedInvestigation: string;
}

interface JudgmentChangeCondition {
  thesisTitle: string;
  currentConviction: string;
  conditions: string[];
  monitoringIndicators: string[];
}

interface InvestmentJudgmentSummary {
  id: string;
  title: string;
  thesisText: string;
  conviction: string;
  assetKeys: string[];
  lastSeenAt?: string | null;
  lastInvestigatedAt?: string | null;
  lastEvidenceAt?: string | null;
  lastDecisionAt?: string | null;
  reviewStatus?: string;
  updatedAt: string;
}

interface JudgmentFailureImpact {
  threadId: string;
  thesisTitle: string;
  conviction: string;
  affectedAssets: Array<{ assetKey: string; weightPct: number }>;
  totalExposurePct: number;
  estimatedLossPct: number;
  riskLevel: string;
}

interface JudgmentMismatchDiagnostic {
  thesisA: { id: string; title: string; conviction: string };
  thesisB: { id: string; title: string; conviction: string };
  conflictType: string;
  overlappingAssets: string[];
  severity: string;
}

interface DailyBriefing {
  surprises: MarketEventReview[];
  cognitionGaps: InvestigationNeed[];
  mindChangeConditions: JudgmentChangeCondition[];
  thesisFailureImpacts?: JudgmentFailureImpact[];
  thesisConflicts?: JudgmentMismatchDiagnostic[];
  strategyOverlay?: StrategyOverlay;
  thesesUpdated: number;
  totalTokens: number;
  estimatedCost: number;
}

interface TodayReviewStatus {
  theses: InvestmentJudgmentSummary[];
  latestRun: {
    id: string;
    status: string;
    createdAt: string;
    totalTokens: number;
    briefing: DailyBriefing | null;
    dailyBrief?: DailyReviewBrief | null;
  } | null;
  experienceRecordCount: number;
  schedule: { mode: string; timesUtc: string[] } | null;
}

type ApiTodayReviewStatus = Omit<TodayReviewStatus, "experienceRecordCount"> & {
  memoryCount: number;
};

type RunResultSummary = {
  thesesUpdated: number;
  marketEventCount: number;
  totalTokens: number;
  errors: string[];
  automaticReview: boolean;
};

type ActionTone = "danger" | "warning" | "primary" | "info" | "neutral";
type ReviewIntent = "approve" | "decide" | "confirm" | "investigate" | "monitor";
type JudgmentQueueReviewAction = "decided" | "snoozed" | "request_investigation";
type DailyDecisionAction = "approve_plan" | "reject_plan" | "hold_current";
type ReviewActionState = { pending?: boolean; label?: string; error?: string };

const COLUMN_LIMIT = 6;

/** 计算下次自动调度运行时间（UTC timesUtc，返回最近未来的一次） */
function computeNextRun(timesUtc: string[]): Date | null {
  if (!timesUtc || timesUtc.length === 0) return null;
  const now = new Date();
  const candidates: Date[] = [];
  for (const t of timesUtc) {
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!timeMatch) continue;
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    for (const dayOffset of [0, 1]) {
      const nextRunDate = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset,
        hour, minute, 0, 0,
      ));
      if (nextRunDate.getTime() > now.getTime()) candidates.push(nextRunDate);
    }
  }
  candidates.sort((leftCandidate, rightCandidate) => leftCandidate.getTime() - rightCandidate.getTime());
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

function formatSchedule(schedule: TodayReviewStatus["schedule"]): string {
  if (!schedule) return "手动触发";
  const nextRun = computeNextRun(schedule.timesUtc);
  const modeLabel = schedule.mode === "2x_daily" ? "每日 2 次"
    : schedule.mode === "daily" ? "每日 1 次"
    : schedule.mode === "every_6h" ? "每 6 小时"
    : "手动";
  if (!nextRun) return modeLabel;
  return `${modeLabel} · 下次 ${nextRun.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} (${formatCountdown(nextRun)})`;
}

function marketEventAction(event: MarketEventReview): { label: string; tone: ActionTone } {
  if (event.severityScore >= 8) return { label: "需要决策", tone: "danger" };
  if (event.severityScore >= 5) return { label: "需要确认", tone: "warning" };
  return { label: "继续观察", tone: "neutral" };
}

function investigationNeedAction(need: InvestigationNeed): { label: string; tone: ActionTone } {
  if (need.portfolioWeight >= 0.05) return { label: "重新看一眼", tone: "primary" };
  return { label: "排队观察", tone: "neutral" };
}

function riskAction(r: JudgmentFailureImpact): { label: string; tone: ActionTone } {
  if (r.riskLevel === "critical") return { label: "需要决策", tone: "danger" };
  if (r.riskLevel === "high") return { label: "检查仓位", tone: "warning" };
  return { label: "持续观察", tone: "neutral" };
}

function intentTone(intent: ReviewIntent): ActionTone {
  if (intent === "approve") return "danger";
  if (intent === "decide") return "danger";
  if (intent === "confirm") return "warning";
  if (intent === "investigate") return "primary";
  return "neutral";
}

function intentLabel(intent: ReviewIntent): string {
  if (intent === "approve") return "待拍板";
  if (intent === "decide") return "今天要决定";
  if (intent === "confirm") return "需要确认";
  if (intent === "investigate") return "重新复核";
  return "后台观察";
}

function toneClasses(tone: ActionTone): string {
  if (tone === "danger") return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]";
  if (tone === "warning") return "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]";
  if (tone === "primary") return "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]";
  if (tone === "info") return "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo)]";
  return "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]";
}

function ActionBadge({ tone, children }: { tone: ActionTone; children: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium ${toneClasses(tone)}`}>
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
      marketEventCount: Number(data.cognitiveRun.surprisesCount ?? 0) || 0,
      totalTokens: Number(data.cognitiveRun.totalTokens ?? 0) || 0,
      errors: Array.isArray(data.cognitiveRun.errors) ? data.cognitiveRun.errors.map(String) : [],
      automaticReview: true,
    };
  }
  return {
    thesesUpdated: Number(data.thesesUpdated ?? 0) || 0,
    marketEventCount: Array.isArray(data.surprises) ? data.surprises.length : 0,
    totalTokens: Number(data.totalTokens ?? 0) || 0,
    errors: Array.isArray(data.errors) ? data.errors.map(String) : [],
    automaticReview: false,
  };
}

function normalizeTodayReviewStatus(value: ApiTodayReviewStatus): TodayReviewStatus {
  const { memoryCount, ...rest } = value;
  return {
    ...rest,
    experienceRecordCount: memoryCount,
  };
}

export default function TodayBriefingView() {
  const [status, setStatus] = useState<TodayReviewStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResultSummary | null>(null);
  const [reviewActions, setReviewActions] = useState<Record<string, ReviewActionState>>({});
  const seenKeyRef = useRef("");

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/daa/agent/theses");
      if (response.ok) {
        const json = await response.json();
        setStatus(normalizeTodayReviewStatus(json.data));
      }
    } catch (error) {
      logSwallowed("today.reviewBriefing.loadStatus", error); // 页面保留当前状态
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const triggerRun = useCallback(async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const response = await fetch("/api/daa/agent/run", { method: "POST" });
      if (response.ok) {
        const json = await response.json();
        setRunResult(normalizeRunResult(json.data));
        await loadStatus();
      }
    } catch (error) {
      logSwallowed("today.reviewBriefing.triggerRun", error); // 按钮状态会恢复
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const triggerBootstrap = useCallback(async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/daa/agent/bootstrap", { method: "POST" });
      if (response.ok) await loadStatus();
    } catch (error) {
      logSwallowed("today.reviewBriefing.triggerBootstrap", error); // 按钮状态会恢复
    } finally {
      setRunning(false);
    }
  }, [loadStatus]);

  const theses = status?.theses ?? [];
  const hasTheses = theses.length > 0;
  const briefing = status?.latestRun?.briefing ?? null;
  const experienceRecordCount = status?.experienceRecordCount ?? 0;

  const sortedBuckets = useMemo<BriefingBuckets>(() => {
    if (!briefing) {
      return {
        marketEvents: [] as MarketEventReview[],
        investigationNeeds: [] as InvestigationNeed[],
        judgmentMismatches: [] as JudgmentMismatchDiagnostic[],
        judgmentRisks: [] as JudgmentFailureImpact[],
      };
    }
    return {
      marketEvents: briefing.surprises.slice().sort((leftEvent, rightEvent) => rightEvent.severityScore - leftEvent.severityScore),
      investigationNeeds: briefing.cognitionGaps.slice().sort((leftNeed, rightNeed) => {
        const leftPriority = leftNeed.portfolioWeight * 100 + Math.min(leftNeed.daysSinceLastInvestigation, 60) / 4;
        const rightPriority = rightNeed.portfolioWeight * 100 + Math.min(rightNeed.daysSinceLastInvestigation, 60) / 4;
        return rightPriority - leftPriority;
      }),
      judgmentMismatches: (briefing.thesisConflicts ?? []).slice(),
      judgmentRisks: (briefing.thesisFailureImpacts ?? []).filter((riskImpact) => riskImpact.riskLevel !== "low")
        .slice()
        .sort((leftRisk, rightRisk) => rightRisk.totalExposurePct - leftRisk.totalExposurePct),
    };
  }, [briefing]);

  const reviewQueue = useMemo(() => buildReviewQueue(sortedBuckets), [sortedBuckets]);

  const markReviewAction = useCallback(async (item: HumanReviewItem, action: JudgmentQueueReviewAction) => {
    const threadIds = Array.from(new Set(item.sourceThreadIds.filter(Boolean)));
    if (threadIds.length === 0) return;

    setReviewActions((prev) => ({
      ...prev,
      [item.key]: { pending: true },
    }));

    try {
      const response = await fetch("/api/daa/agent/theses/review-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadIds, action }),
      });
      if (!response.ok) throw new Error(`review action failed: ${response.status}`);
      const label = action === "decided" ? "已同意当前处理"
        : action === "snoozed" ? "已暂不处理"
        : "已要求深入复核";
      setReviewActions((prev) => ({
        ...prev,
        [item.key]: { label },
      }));
      await loadStatus();
    } catch (error) {
      logSwallowed("today.reviewBriefing.reviewAction", error);
      setReviewActions((prev) => ({
        ...prev,
        [item.key]: { error: "记录失败" },
      }));
    }
  }, [loadStatus]);

  useEffect(() => {
    const threadIds = Array.from(new Set(
      reviewQueue.topItems.flatMap((item) => item.sourceThreadIds).filter(Boolean),
    ));
    if (threadIds.length === 0) return;
    const key = threadIds.slice().sort().join("|");
    if (seenKeyRef.current === key) return;
    seenKeyRef.current = key;
    void fetch("/api/daa/agent/theses/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadIds }),
    }).catch((error) => logSwallowed("today.reviewBriefing.markSeen", error));
  }, [reviewQueue.topItems]);

  if (loading) {
    return (
      <DaaSurfacePanel accent="primary" title="今日结论">
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
          <span>加载今日复核状态...</span>
        </div>
      </DaaSurfacePanel>
    );
  }

  return (
    <DaaSurfacePanel
      accent="primary"
      title="今日结论"
      subtitle="先看是否需要动作。"
      className="w-full"
      bodyClassName="px-4 py-4 sm:px-5"
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
              建立判断
            </DaaSurfaceActionButton>
          ) : null}
          <DaaSurfaceActionButton
            tone="neutral"
            className="h-8 px-2.5 text-xs"
            onClick={triggerRun}
            disabled={running || !hasTheses}
            title="立即刷新一次后台复核"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新
          </DaaSurfaceActionButton>
        </div>
      )}
    >
      <div className="space-y-4">
        {!hasTheses ? (
          <DaaSurfaceEmptyState
            title="初始判断尚未建立"
            description="先基于持仓生成初始判断。"
            action={(
              <DaaSurfaceActionButton tone="primary" onClick={triggerBootstrap} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                建立判断
              </DaaSurfaceActionButton>
            )}
          />
        ) : briefing ? (
          <DecisionQueueView
            queue={reviewQueue}
            buckets={sortedBuckets}
            briefing={briefing}
            dailyBrief={status?.latestRun?.dailyBrief ?? null}
            latestRunAt={status?.latestRun?.createdAt}
            schedule={status?.schedule ?? null}
            actionStates={reviewActions}
            onReviewAction={markReviewAction}
          />
        ) : (
          <DaaSurfaceEmptyState
            title="还没有今日结论"
            description="刷新后显示今天是否需要行动。"
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
          <div className="rounded-[var(--radius-md)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
            <div className="font-medium text-[var(--text)]">
              {runResult.automaticReview ? "自动复核完成" : "后台复核完成"}：更新 {runResult.thesesUpdated} 条投资判断，发现 {runResult.marketEventCount} 条需要确认的变化。
            </div>
            {runResult.errors.length > 0 ? (
              <div className="mt-1 text-[var(--amber)]">{runResult.errors.length} 个错误：{runResult.errors[0]}</div>
            ) : null}
          </div>
        ) : null}

        {status?.latestRun ? (
          <div className="text-xs leading-5 text-[var(--muted)]">
            状态 {status.latestRun.status} · {status.latestRun.totalTokens} tokens
            {briefing?.estimatedCost ? ` · $${briefing.estimatedCost.toFixed(4)}` : ""}
            {experienceRecordCount > 0 ? (
              <>
                {" · "}
                <Link href="/daa/dashboard/today/experience-library" className="text-[var(--muted)] transition-colors hover:text-[var(--primary)]">
                  {experienceRecordCount} 条经验
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </DaaSurfacePanel>
  );
}

interface BriefingBuckets {
  marketEvents: MarketEventReview[];
  investigationNeeds: InvestigationNeed[];
  judgmentMismatches: JudgmentMismatchDiagnostic[];
  judgmentRisks: JudgmentFailureImpact[];
}

type HumanReviewItem = {
  key: string;
  intent: ReviewIntent;
  sourceThreadIds: string[];
  title: React.ReactNode;
  why: React.ReactNode;
  nextStep: React.ReactNode;
  basisText: string;
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
  const marketEventItems: HumanReviewItem[] = buckets.marketEvents.map((event, index) => {
    const intent: ReviewIntent = event.severityScore >= 8 ? "decide" : event.severityScore >= 5 ? "confirm" : "monitor";
    return {
      key: `market-event-${index}`,
      intent,
      sourceThreadIds: event.relatedThesisId ? [event.relatedThesisId] : [],
      title: event.title,
      why: event.description,
      nextStep: event.suggestedAction || "继续观察，等待更多依据。",
      basisText: `新变化 · 重要度 ${event.severityScore}`,
      score: event.severityScore * 12,
    };
  });

  const investigationNeedItems: HumanReviewItem[] = buckets.investigationNeeds.map((need, index) => {
    const weightPct = need.portfolioWeight * 100;
    const isImportant = need.portfolioWeight >= 0.05;
    return {
      key: `investigation-${need.assetKey}-${index}`,
      intent: isImportant ? "investigate" : "monitor",
      sourceThreadIds: need.sourceThesisId ? [need.sourceThesisId] : [],
      title: formatAssetLabelByKey(need.assetKey),
      why: need.uncertaintyReason,
      nextStep: need.suggestedInvestigation || "排队补做一次轻量复核。",
      basisText: weightPct > 0
        ? `持仓 ${weightPct.toFixed(1)}% · 相关判断上次复核 ${need.daysSinceLastInvestigation} 天前`
        : `观察名单 · 相关判断上次复核 ${need.daysSinceLastInvestigation} 天前`,
      score: weightPct * 4 + Math.min(need.daysSinceLastInvestigation, 90),
    };
  });

  const riskItems: HumanReviewItem[] = buckets.judgmentRisks.map((risk) => {
    const riskBoost = risk.riskLevel === "critical" ? 80 : risk.riskLevel === "high" ? 55 : 25;
    const affectedAssets = risk.affectedAssets.slice(0, 3).map((affectedAsset) => formatAssetLabelByKey(affectedAsset.assetKey)).join("、");
    return {
      key: `risk-${risk.threadId}`,
      intent: risk.riskLevel === "critical" || risk.riskLevel === "high" ? "decide" : "confirm",
      sourceThreadIds: [risk.threadId],
      title: risk.thesisTitle,
      why: `如果这个判断错了，会影响 ${affectedAssets}`,
      nextStep: risk.riskLevel === "critical" || risk.riskLevel === "high"
        ? "确认是否需要调整目标权重、减少集中暴露，或要求深度复核。"
        : "保持观察；如果相关资产继续扩大偏离，再升级为决策事项。",
      basisText: `判断风险 · 暴露 ${(risk.totalExposurePct * 100).toFixed(1)}% · 情景损失 ${(risk.estimatedLossPct * 100).toFixed(1)}%`,
      score: risk.totalExposurePct * 100 + risk.estimatedLossPct * 120 + riskBoost,
      href: `/daa/dashboard/today/thesis/${risk.threadId}`,
    };
  });

  const items = [...marketEventItems, ...investigationNeedItems, ...riskItems].sort((leftItem, rightItem) => rightItem.score - leftItem.score);
  return {
    items,
    topItems: items.slice(0, 5),
    decisionCount: items.filter((item) => item.intent === "decide").length,
    confirmCount: items.filter((item) => item.intent === "confirm").length,
    investigateCount: items.filter((item) => item.intent === "investigate").length,
    monitorCount: items.filter((item) => item.intent === "monitor").length,
    importantInvestigationCount: buckets.investigationNeeds.filter((need) => need.portfolioWeight >= 0.05).length,
    diagnosticsCount: buckets.judgmentMismatches.length,
  };
}

function DecisionQueueView({
  queue,
  buckets,
  briefing,
  dailyBrief: apiDailyBrief,
  latestRunAt,
  schedule,
  actionStates,
  onReviewAction,
}: {
  queue: ReviewQueue;
  buckets: BriefingBuckets;
  briefing: DailyBriefing;
  dailyBrief: DailyReviewBrief | null;
  latestRunAt?: string;
  schedule: TodayReviewStatus["schedule"];
  actionStates: Record<string, ReviewActionState>;
  onReviewAction: (item: HumanReviewItem, action: JudgmentQueueReviewAction) => Promise<void>;
}) {
  const [workOpen, setWorkOpen] = useState(false);
  const [dailyReviewActionState, setDailyReviewActionState] = useState<ReviewActionState>({});
  const backgroundCount = buckets.marketEvents.length + buckets.investigationNeeds.length + buckets.judgmentRisks.length + buckets.judgmentMismatches.length;
  const dailyBrief = apiDailyBrief ?? buildDailyReviewBrief({
    queue,
    backgroundCount,
    strategyOverlay: briefing.strategyOverlay ?? null,
  });
  const authorizationItems = dailyBrief.approvals.slice(0, 5).map((approval) => ({
    key: approval.key,
    intent: "approve" as const,
    sourceThreadIds: [],
    title: approval.title,
    why: approval.reason,
    nextStep: "查看完整目标权重方案，确认后再进入调仓处理。",
    basisText: approval.confidencePct == null ? "目标权重方案" : `目标权重方案 · 置信度 ${approval.confidencePct}%`,
    score: approval.confidencePct ?? 100,
    href: "/daa/dashboard/today/decisions",
  }));
  const investigationItems = queue.items.slice(0, 5);
  const recordDailyDecision = useCallback(async (action: DailyDecisionAction) => {
    setDailyReviewActionState({ pending: true });
    try {
      const response = await fetch("/api/daa/agent/daily-decision/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(`daily decision action failed: ${response.status}`);
      const label = action === "approve_plan" ? "已记录：批准方案"
        : action === "reject_plan" ? "已记录：拒绝方案"
        : "已记录：保持当前";
      setDailyReviewActionState({ label });
    } catch (error) {
      logSwallowed("today.reviewBriefing.dailyReviewAction", error);
      setDailyReviewActionState({ error: "记录失败" });
    }
  }, []);

  return (
    <div className="space-y-5">
      <DecisionConclusionPanel
        dailyBrief={dailyBrief}
        latestRunAt={latestRunAt}
        schedule={schedule}
      />

      <section className="space-y-3">
        <SectionHeader
          icon={<ShieldCheck className="h-4 w-4 text-[var(--primary)]" />}
          title="需要你拍板"
          subtitle={authorizationItems.length > 0 ? "这里只放会改变目标权重或调仓方案的动作。" : "今天没有需要你拍板的组合动作。"}
          count={authorizationItems.length}
        />
        {authorizationItems.length > 0 ? (
          <div className="space-y-3">
            <DailyDecisionActionBar
              dailyBrief={dailyBrief}
              state={dailyReviewActionState}
              onAction={recordDailyDecision}
            />
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
              {authorizationItems.map((item) => (
                <HumanReviewRow
                  key={item.key}
                  item={item}
                  mode="authorization"
                  actionState={actionStates[item.key]}
                  onReviewAction={onReviewAction}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <div className="text-sm text-[var(--muted)]">
              当前没有提出目标权重变化；风险、新闻和既有判断都放在后台继续处理。
            </div>
            <div className="mt-3">
              <DailyDecisionActionBar
                dailyBrief={dailyBrief}
                state={dailyReviewActionState}
                onAction={recordDailyDecision}
                compact
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            icon={<Search className="h-4 w-4 text-[var(--amber)]" />}
            title="后台复核"
            subtitle="排队复核，不占主待办。"
            count={backgroundCount}
          />
          <button
            type="button"
            onClick={() => setWorkOpen((value) => !value)}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--elevated)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            {workOpen ? "收起复核细节" : `查看复核细节 ${backgroundCount}`}
          </button>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] md:grid-cols-3 [&>*:last-child]:border-b-0 md:[&>*:last-child]:border-r-0">
          <BackgroundWorkStat label="新变化" value={buckets.marketEvents.length} hint="新闻、市场数据、价格异常" />
          <BackgroundWorkStat label="排队复核" value={queue.investigateCount} hint={queue.importantInvestigationCount > 0 ? `${queue.importantInvestigationCount} 个重要持仓` : "低优先级自动排队"} />
          <BackgroundWorkStat label="后台诊断" value={queue.diagnosticsCount + buckets.judgmentRisks.length} hint="高暴露风险和判断关系" />
        </div>

        <ReviewLogicDisclosure />
        {workOpen ? (
          <div className="space-y-4">
            {investigationItems.length > 0 ? (
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
                {investigationItems.map((item) => (
                  <HumanReviewRow
                    key={item.key}
                    item={item}
                    mode="background"
                    actionState={actionStates[item.key]}
                    onReviewAction={onReviewAction}
                  />
                ))}
              </div>
            ) : null}
            <BriefingDetailColumns buckets={buckets} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function decisionTone(posture: DailyReviewBrief["posture"]): ActionTone {
  if (posture === "approve_required") return "danger";
  if (posture === "risk_watch") return "warning";
  if (posture === "investigating") return "primary";
  return "neutral";
}

function DecisionConclusionPanel({
  dailyBrief,
  latestRunAt,
  schedule,
}: {
  dailyBrief: DailyReviewBrief;
  latestRunAt?: string;
  schedule: TodayReviewStatus["schedule"];
}) {
  const postureClasses = dailyBrief.posture === "approve_required"
    ? "border-[var(--danger-border)] bg-[var(--danger-bg)]"
    : dailyBrief.posture === "risk_watch"
      ? "border-[var(--amber-border)] bg-[var(--amber-bg)]"
      : dailyBrief.posture === "investigating"
        ? "border-[var(--primary-border)] bg-[var(--primary-bg)]"
        : "border-[var(--border)] bg-[var(--surface)]";

  return (
    <section className={`rounded-[var(--radius-md)] border px-4 py-4 sm:px-5 ${postureClasses}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge tone={decisionTone(dailyBrief.posture)}>{dailyBrief.label}</ActionBadge>
            <span className="text-xs text-[var(--muted)]">最近运行 {formatLatestRun(latestRunAt)}</span>
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-7 text-[var(--text)] sm:text-2xl">
            {dailyBrief.title}
          </h2>
          <p className="mt-1.5 line-clamp-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
            {dailyBrief.description}
          </p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:w-[520px]">
          <ConclusionMetric label="待拍板" value={dailyBrief.metrics.approvalCount} />
          <ConclusionMetric label="后台任务" value={dailyBrief.metrics.backgroundCount} />
          <ConclusionMetric label="下次运行" value={formatSchedule(schedule)} wide />
        </div>
      </div>
    </section>
  );
}

function ConclusionMetric({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]/80 px-3 py-2 ${wide ? "sm:col-span-1" : ""}`}>
      <div className="text-[11px] font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate font-[var(--font-mono)] text-sm leading-5 text-[var(--text)]">{value}</div>
    </div>
  );
}

function DailyDecisionActionBar({
  dailyBrief,
  state,
  onAction,
  compact,
}: {
  dailyBrief: DailyReviewBrief;
  state: ReviewActionState;
  onAction: (action: DailyDecisionAction) => Promise<void>;
  compact?: boolean;
}) {
  if (state.label || state.error) {
    return (
      <div className={`rounded-[var(--radius-sm)] border px-3 py-2 text-xs leading-5 ${
        state.error
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
          : "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]"
      }`}>
        {state.error ?? state.label}
      </div>
    );
  }

  const disabled = state.pending === true;
  const hasPlan = dailyBrief.approvals.length > 0;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3"}`}>
      {hasPlan ? (
        <>
          <DaaSurfaceActionButton
            tone="primary"
            className="min-h-8 px-3 py-1.5 text-xs"
            disabled={disabled}
            onClick={() => void onAction("approve_plan")}
          >
            {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            批准方案
          </DaaSurfaceActionButton>
          <DaaSurfaceActionButton
            tone="neutral"
            className="min-h-8 px-3 py-1.5 text-xs"
            disabled={disabled}
            onClick={() => void onAction("hold_current")}
          >
            <Clock3 className="h-3.5 w-3.5" />
            保持当前
          </DaaSurfaceActionButton>
          <DaaSurfaceActionButton
            tone="neutral"
            className="min-h-8 px-3 py-1.5 text-xs"
            disabled={disabled}
            onClick={() => void onAction("reject_plan")}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            拒绝方案
          </DaaSurfaceActionButton>
          <span className="text-xs leading-5 text-[var(--muted)]">动作会写入决策记录；交易仍走调仓页风控。</span>
        </>
      ) : (
        <>
          <DaaSurfaceActionButton
            tone="neutral"
            className="min-h-8 px-3 py-1.5 text-xs"
            disabled={disabled}
            onClick={() => void onAction("hold_current")}
          >
            {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            记录保持当前
          </DaaSurfaceActionButton>
          <span className="text-xs leading-5 text-[var(--muted)]">只记录今天的人工结论，不影响后台复核。</span>
        </>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        {icon}
        {title}
        <span className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">{count}</span>
      </div>
      <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{subtitle}</div>
    </div>
  );
}

function BackgroundWorkStat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="border-b border-[var(--border)] px-4 py-3 md:border-b-0 md:border-r">
      <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 font-[var(--font-mono)] text-lg leading-6 text-[var(--text)]">{value}</div>
      <div className="mt-1 truncate text-xs leading-5 text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function HumanReviewRow({
  item,
  mode,
  actionState,
  onReviewAction,
}: {
  item: HumanReviewItem;
  mode: "authorization" | "background";
  actionState?: ReviewActionState;
  onReviewAction: (item: HumanReviewItem, action: JudgmentQueueReviewAction) => Promise<void>;
}) {
  const titleNode = item.href ? (
    <Link href={item.href} className="line-clamp-1 text-sm font-semibold leading-5 text-[var(--text)] transition-colors hover:text-[var(--primary)]">
      {item.title}
    </Link>
  ) : (
    <div className="line-clamp-1 text-sm font-semibold leading-5 text-[var(--text)]">{item.title}</div>
  );

  return (
    <div className="grid min-w-0 gap-3 border-b border-[var(--border)] px-3.5 py-3 last:border-b-0 lg:grid-cols-[132px_minmax(0,1.25fr)_minmax(220px,0.9fr)_minmax(190px,0.7fr)] lg:items-start">
      <div className="flex min-w-0 items-center justify-between gap-2 lg:block">
        <ActionBadge tone={intentTone(item.intent)}>{intentLabel(item.intent)}</ActionBadge>
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--faint)] lg:mt-2">优先级 {Math.round(item.score)}</div>
      </div>
      <div className="min-w-0">
        {titleNode}
        <div className="mt-1 line-clamp-1 text-[11px] leading-5 text-[var(--faint)]">{item.basisText}</div>
      </div>
      <div className="min-w-0 text-xs leading-5">
        <div className="font-medium text-[var(--text)]">复核原因</div>
        <div className="line-clamp-2 text-[var(--muted)]">{item.why}</div>
      </div>
      <div className="min-w-0 text-xs leading-5">
        <div className="font-medium text-[var(--text)]">下一步</div>
        <div className="line-clamp-2 text-[var(--muted)]">{item.nextStep}</div>
        {item.sourceThreadIds.length > 0 ? (
          <ReviewActionButtons
            item={item}
            mode={mode}
            actionState={actionState}
            onReviewAction={onReviewAction}
          />
        ) : mode === "authorization" && item.href ? (
          <div className="mt-2">
            <Link
              href={item.href}
              className="inline-flex h-7 items-center rounded-[var(--radius-sm)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-2 text-[11px] font-medium text-[var(--primary)] transition-colors hover:border-[var(--primary)]"
            >
              查看调仓方案
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReviewActionButtons({
  item,
  mode,
  actionState,
  onReviewAction,
}: {
  item: HumanReviewItem;
  mode: "authorization" | "background";
  actionState?: ReviewActionState;
  onReviewAction: (item: HumanReviewItem, action: JudgmentQueueReviewAction) => Promise<void>;
}) {
  if (actionState?.label || actionState?.error) {
    return (
      <div className={`mt-3 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[11px] leading-4 ${
        actionState.error
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
          : "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]"
      }`}>
        {actionState.error ?? actionState.label}
      </div>
    );
  }

  const disabled = actionState?.pending === true;
  if (mode === "background") {
    return (
      <div className="mt-2">
        <QueueActionButton
          title="让下一次复核优先深入处理这条判断"
          disabled={disabled}
          onClick={() => onReviewAction(item, "request_investigation")}
        >
          {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          深入复核
        </QueueActionButton>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <QueueActionButton
        title="接受这件事的当前处理"
        disabled={disabled}
        onClick={() => onReviewAction(item, "decided")}
      >
        {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        同意当前处理
      </QueueActionButton>
      <QueueActionButton
        title="这件事今天不处理，3 天后再放回视野"
        disabled={disabled}
        onClick={() => onReviewAction(item, "snoozed")}
      >
        <Clock3 className="h-3.5 w-3.5" />
        暂不处理
      </QueueActionButton>
      <QueueActionButton
        title="下次复核时优先深入处理"
        disabled={disabled}
        onClick={() => onReviewAction(item, "request_investigation")}
      >
        <Search className="h-3.5 w-3.5" />
        深入复核
      </QueueActionButton>
    </div>
  );
}

function QueueActionButton({
  children,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 min-w-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--elevated)] px-2 text-[11px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function ReviewLogicDisclosure() {
  return (
    <details className="group max-w-3xl text-xs leading-5 text-[var(--muted)]">
      <summary className="cursor-pointer list-none font-medium text-[var(--text)] transition-colors hover:text-[var(--primary)]">
        “等后台复核”怎么算？
        <span className="ml-2 text-[var(--faint)] group-open:hidden">展开</span>
        <span className="ml-2 hidden text-[var(--faint)] group-open:inline">收起</span>
      </summary>
      <div className="mt-1">
        它不是你有没有打开页面，而是最近有没有对该持仓相关判断完成一次后台复核。
        重要持仓超过 7 天没有新依据，或判断仍不明确，就会进入后台复核计划；下次完成复核后会自动重置。
      </div>
    </details>
  );
}

function BriefingDetailColumns({ buckets }: { buckets: BriefingBuckets }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.08fr_1fr_1fr]">
      <KanbanColumn
        icon={<AlertTriangle className="h-4 w-4 text-[var(--amber)]" />}
        title="需要确认的新变化"
        subtitle="可能影响原判断"
        count={buckets.marketEvents.length}
        emptyText="今天没有明显影响持仓的新变化"
      >
        {buckets.marketEvents.slice(0, COLUMN_LIMIT).map((event, index) => (
          <MarketEventCard key={`event-${index}`} event={event} />
        ))}
      </KanbanColumn>

      <KanbanColumn
        icon={<Search className="h-4 w-4 text-[var(--primary)]" />}
        title="等待后台复核"
        subtitle="这些持仓最近没有留下有效新依据"
        count={buckets.investigationNeeds.length}
        emptyText="重要持仓近期都复核过"
      >
        {buckets.investigationNeeds.slice(0, COLUMN_LIMIT).map((need, index) => (
          <InvestigationNeedCard key={`need-${index}`} need={need} />
        ))}
      </KanbanColumn>

      <KanbanColumn
        icon={<Network className="h-4 w-4 text-[var(--indigo)]" />}
        title="后台诊断"
        subtitle="不直接等同待办"
        count={buckets.judgmentMismatches.length + buckets.judgmentRisks.length}
        emptyText="当前没有后台诊断事项"
      >
        {buckets.judgmentMismatches.slice(0, 2).map((mismatch, index) => (
          <JudgmentMismatchDiagnosticCard key={`mismatch-${index}`} mismatch={mismatch} />
        ))}
        {buckets.judgmentRisks.slice(0, COLUMN_LIMIT - Math.min(buckets.judgmentMismatches.length, 2)).map((risk, index) => (
          <JudgmentRiskCard key={`risk-${index}`} risk={risk} />
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
    <section className="flex min-w-0 flex-col rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <header className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
            {icon}
            {title}
            <span className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">{count}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{subtitle}</div>
        </div>
      </header>
      <div className="flex flex-col gap-2.5 p-3">
        {hasChildren ? children : (
          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-2.5 py-2 text-xs text-[var(--muted)]">{emptyText}</div>
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
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
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

function MarketEventCard({ event }: { event: MarketEventReview }) {
  return (
    <CardShell
      action={marketEventAction(event)}
      meta={`重要度 ${event.severityScore}`}
      title={event.title}
      detail={event.description}
      hint={event.suggestedAction}
    />
  );
}

function InvestigationNeedCard({ need }: { need: InvestigationNeed }) {
  const weightLabel = need.portfolioWeight > 0
    ? `持仓 ${(need.portfolioWeight * 100).toFixed(1)}% · 相关判断上次复核 ${need.daysSinceLastInvestigation} 天前`
    : `观察资产 · 相关判断上次复核 ${need.daysSinceLastInvestigation} 天前`;
  return (
    <CardShell
      action={investigationNeedAction(need)}
      meta={weightLabel}
      title={formatAssetLabelByKey(need.assetKey)}
      detail={need.uncertaintyReason}
      hint={need.suggestedInvestigation}
    />
  );
}

function JudgmentMismatchDiagnosticCard({ mismatch }: { mismatch: JudgmentMismatchDiagnostic }) {
  const title = mismatch.overlappingAssets.length > 0
    ? mismatch.overlappingAssets.map((k) => formatAssetLabelByKey(k)).join("、")
    : "同一资产";
  return (
    <CardShell
      action={{ label: "判断不一致", tone: "info" }}
      meta={`方向不同：${mismatch.thesisA.conviction} vs ${mismatch.thesisB.conviction}`}
      title={title}
      detail={`${mismatch.thesisA.title} / ${mismatch.thesisB.title}`}
    />
  );
}

function JudgmentRiskCard({ risk }: { risk: JudgmentFailureImpact }) {
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

function MindChangeSection({ conditions }: { conditions: JudgmentChangeCondition[] }) {
  const top = conditions.slice(0, 3);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
        <RotateCcw className="h-4 w-4 text-[var(--amber)]" />
        什么会改变判断
      </div>
      <div className="space-y-2 border-l border-[var(--border)] pl-3">
        {top.map((condition, index) => (
          <div key={`${condition.thesisTitle}-${index}`} className="text-sm leading-5">
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
