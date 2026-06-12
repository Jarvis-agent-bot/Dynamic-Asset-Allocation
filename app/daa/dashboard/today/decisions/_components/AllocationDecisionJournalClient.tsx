"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Workflow,
} from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfacePanel,
  daaSurfaceDenseFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatDateTime, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { formatAssetLabelByKey } from "@/src/daa/assetRegistry";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type DecisionKind =
  | "strategy_target_allocation"
  | "strategy_regime_override"
  | "strategy_plan_summary"
  | "thesis_review"
  | "human_daily_decision";

type TargetAllocationIntent = {
  assetKey: string;
  symbol: string;
  proposedTargetWeightPct: number;
  confidence: number;
  reasoning: string;
};

type StrategyOverlay = {
  generatedAt: string;
  agentRunId: string;
  regimeOverride: {
    suggestedRegime: "risk_on" | "transitional" | "risk_off";
    confidence: number;
    reasoning: string;
    ruleBasedRegime: string;
  } | null;
  targetAllocationPlan?: {
    reasoning: string;
    intents: TargetAllocationIntent[];
  } | null;
};

type DecisionAuditRecord = {
  id: string;
  agentRunId?: string | null;
  cycleId?: string | null;
  node: string;
  decisionKind: DecisionKind;
  assetKey?: string | null;
  symbol?: string | null;
  summary?: string | null;
  reasoning?: string | null;
  confidencePct?: number | null;
  decisionPayload?: Record<string, unknown> | null;
  createdAt: string;
};

type TargetWeightAuditRecord = {
  id: string;
  assetKey: string;
  symbol: string | null;
  previousTargetWeightPct: number | null;
  nextTargetWeightPct: number;
  source: string;
  reason: string | null;
  actor: string | null;
  agentRunId: string | null;
  cycleId: string | null;
  createdAt: string;
};

type DecisionLedgerReadModel = {
  latestRun: {
    id: string;
    status: string;
    trigger: string;
    createdAt: string;
    completedAt: string | null;
    totalTokens: number;
    totalCostUsd: number;
    strategyOverlay: StrategyOverlay | null;
  } | null;
  decisionAudits: DecisionAuditRecord[];
  targetWeightAudits: TargetWeightAuditRecord[];
};

type DecisionKindFilter = "all" | DecisionKind;

const DECISION_KIND_FILTERS: Array<{ value: DecisionKindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "strategy_target_allocation", label: "目标权重" },
  { value: "strategy_plan_summary", label: "计划摘要" },
  { value: "strategy_regime_override", label: "市场状态" },
  { value: "thesis_review", label: "判断复盘" },
  { value: "human_daily_decision", label: "人工拍板" },
];

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatRunStatus(status: string): string {
  if (status === "completed") return "完成";
  if (status === "completed_with_errors") return "完成，有错误";
  if (status === "failed") return "失败";
  if (status === "running") return "复核中";
  return status || "-";
}

function formatTrigger(trigger: string): string {
  if (trigger === "scheduled") return "自动调度";
  if (trigger === "manual") return "手动";
  if (trigger === "event_driven") return "事件";
  return trigger || "-";
}

function DecisionLedgerMetric({
  label,
  value,
  detail,
  tone = "neutral",
  index,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
  index: number;
}) {
  const toneClass = {
    primary: "text-[var(--primary)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--amber)]",
    danger: "text-[var(--danger)]",
    info: "text-[var(--indigo)]",
    neutral: "text-[var(--text)]",
  }[tone];
  const borderClass = [
    index % 2 === 0 ? "border-r border-[var(--border)]" : "",
    index < 2 ? "border-b border-[var(--border)]" : "",
    index % 4 === 3 ? "xl:border-r-0" : "xl:border-r xl:border-[var(--border)]",
    "xl:border-b-0",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{label}</div>
      <div className={`mt-1 truncate font-[var(--font-mono)] text-[20px] leading-none ${toneClass}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function formatDecisionKind(kind: DecisionKind): string {
  if (kind === "strategy_target_allocation") return "目标权重";
  if (kind === "strategy_regime_override") return "市场状态";
  if (kind === "strategy_plan_summary") return "计划摘要";
  if (kind === "thesis_review") return "判断复盘";
  if (kind === "human_daily_decision") return "人工拍板";
  return kind;
}

function toneForConfidence(value: number | null | undefined): "success" | "warning" | "neutral" {
  const confidence = Number(value);
  if (Number.isFinite(confidence) && confidence >= 80) return "success";
  if (Number.isFinite(confidence) && confidence >= 60) return "warning";
  return "neutral";
}

function confidenceLabel(value: number | null | undefined): string {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? `${confidence.toFixed(0)}%` : "-";
}

function assetDisplayName(assetKey: string | null | undefined, symbol?: string | null): string {
  const key = normalizeText(assetKey);
  const sym = normalizeText(symbol);
  if (!key) return sym || "-";
  const label = formatAssetLabelByKey(key);
  return sym && !label.includes(sym) ? `${sym} · ${label}` : label;
}

function readNumber(record: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = Number(record?.[key]);
  return Number.isFinite(value) ? value : null;
}

function findLatestAuditForIntent(intent: TargetAllocationIntent, audits: DecisionAuditRecord[]): DecisionAuditRecord | null {
  const key = intent.assetKey.trim().toUpperCase();
  const symbol = intent.symbol.trim().toUpperCase();
  return audits.find((audit) => {
    if (audit.decisionKind !== "strategy_target_allocation") return false;
    const auditKey = normalizeText(audit.assetKey).toUpperCase();
    const auditSymbol = normalizeText(audit.symbol).toUpperCase();
    return (key && auditKey === key) || (symbol && auditSymbol === symbol);
  }) ?? null;
}

function filterDecisionAudits(audits: DecisionAuditRecord[], kind: DecisionKindFilter, query: string): DecisionAuditRecord[] {
  const needle = query.trim().toUpperCase();
  return audits.filter((audit) => {
    if (kind !== "all" && audit.decisionKind !== kind) return false;
    if (!needle) return true;
    const haystack = [
      audit.assetKey,
      audit.symbol,
      audit.summary,
      audit.reasoning,
      audit.agentRunId,
      audit.cycleId,
    ].map((value) => normalizeText(value).toUpperCase()).join(" ");
    return haystack.includes(needle);
  });
}

function filterTargetWeightAudits(audits: TargetWeightAuditRecord[], query: string): TargetWeightAuditRecord[] {
  const needle = query.trim().toUpperCase();
  if (!needle) return audits;
  return audits.filter((audit) => [
    audit.assetKey,
    audit.symbol,
    audit.reason,
    audit.agentRunId,
    audit.cycleId,
  ].map((value) => normalizeText(value).toUpperCase()).join(" ").includes(needle));
}

function compactId(value: string | null | undefined): string {
  const id = normalizeText(value);
  if (!id) return "-";
  return id.length > 13 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function formatWeightChange(audit: TargetWeightAuditRecord): string {
  const prev = audit.previousTargetWeightPct == null ? "未设置" : formatPercent(audit.previousTargetWeightPct, 2);
  return `${prev} -> ${formatPercent(audit.nextTargetWeightPct, 2)}`;
}

function readJsonData(value: unknown): DecisionLedgerReadModel | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as { data?: unknown };
  if (!envelope.data || typeof envelope.data !== "object") return null;
  return envelope.data as DecisionLedgerReadModel;
}

export default function AllocationDecisionJournalClient() {
  const [decisionLedger, setDecisionLedger] = useState<DecisionLedgerReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [decisionKindFilter, setDecisionKindFilter] = useState<DecisionKindFilter>("all");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/daa/agent/decision-journal", { cache: "no-store" });
      if (!response.ok) return;
      const json = readJsonData(await response.json());
      if (json) setDecisionLedger(json);
    } catch (error) {
      logSwallowed("allocationDecisionJournal.load", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latestStrategyOverlay = decisionLedger?.latestRun?.strategyOverlay ?? null;
  const latestPlan = latestStrategyOverlay?.targetAllocationPlan ?? null;
  const targetAllocationIntents = latestPlan?.intents ?? [];
  const targetWeightAudits = decisionLedger?.targetWeightAudits ?? [];
  const decisionAudits = decisionLedger?.decisionAudits ?? [];
  const filteredDecisionAudits = useMemo(
    () => filterDecisionAudits(decisionAudits, decisionKindFilter, query),
    [decisionAudits, decisionKindFilter, query],
  );
  const filteredTargetAudits = useMemo(
    () => filterTargetWeightAudits(targetWeightAudits, query),
    [targetWeightAudits, query],
  );

  if (loading) {
    return (
      <DaaSurfacePanel accent="info" title="调仓决策记录">
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--indigo)]" />
          <span>加载调仓决策记录...</span>
        </div>
      </DaaSurfacePanel>
    );
  }

  const latestRun = decisionLedger?.latestRun ?? null;
  const targetDecisionCount = decisionAudits.filter((audit) => audit.decisionKind === "strategy_target_allocation").length;

  return (
    <div className="space-y-5">
      <DaaSurfacePanel
        accent="info"
        title="调仓决策记录"
        subtitle="按复核批次、目标权重和明细记录追溯每一次组合调整理由。"
        action={(
          <DaaSurfaceActionButton tone="neutral" className="h-8 px-2.5 text-xs" onClick={() => void load("refresh")} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新
          </DaaSurfaceActionButton>
        )}
      >
        <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] xl:grid-cols-4">
          <DecisionLedgerMetric
            label="最新复核"
            value={latestRun ? formatRunStatus(latestRun.status) : "-"}
            detail={latestRun ? `${formatTrigger(latestRun.trigger)} · ${formatDateTime(latestRun.createdAt)}` : "暂无策略复核"}
            tone={latestRun?.status === "failed" ? "danger" : "info"}
            index={0}
          />
          <DecisionLedgerMetric
            label="本轮目标"
            value={targetAllocationIntents.length}
            detail={targetAllocationIntents.length > 0 ? "最新策略计划中的目标资产" : "本轮未输出目标权重"}
            tone={targetAllocationIntents.length > 0 ? "success" : "neutral"}
            index={1}
          />
          <DecisionLedgerMetric
            label="复核依据"
            value={decisionAudits.length}
            detail={targetDecisionCount > 0 ? `${targetDecisionCount} 条目标权重理由` : "暂无目标权重理由"}
            tone="primary"
            index={2}
          />
          <DecisionLedgerMetric
            label="权重写入"
            value={targetWeightAudits.length}
            detail={targetWeightAudits.length > 0 ? "已写入目标权重池" : "暂无目标权重写入"}
            tone={targetWeightAudits.length > 0 ? "warning" : "neutral"}
            index={3}
          />
        </div>
      </DaaSurfacePanel>

      {latestStrategyOverlay ? (
        <DaaSurfacePanel
          accent="primary"
          title="最新策略计划"
          subtitle={latestRun ? `复核批次 ${compactId(latestRun.id)} · ${formatDateTime(latestStrategyOverlay.generatedAt || latestRun.createdAt)}` : undefined}
        >
          <div className="space-y-4">
            {latestStrategyOverlay.regimeOverride ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Workflow className="h-4 w-4 text-[var(--primary)]" />
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {latestStrategyOverlay.regimeOverride.ruleBasedRegime}{" -> "}{latestStrategyOverlay.regimeOverride.suggestedRegime}
                  </span>
                  <span className="rounded-[var(--radius-sm)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-2 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--primary)]">
                    {confidenceLabel(latestStrategyOverlay.regimeOverride.confidence)}
                  </span>
                </div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{latestStrategyOverlay.regimeOverride.reasoning}</div>
              </div>
            ) : null}

            {latestPlan ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <Target className="h-4 w-4 text-[var(--success)]" />
                  目标权重计划
                </div>
                {latestPlan.reasoning ? (
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{latestPlan.reasoning}</div>
                ) : null}
                {targetAllocationIntents.length > 0 ? (
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {targetAllocationIntents.map((intent) => {
                      const audit = findLatestAuditForIntent(intent, decisionAudits);
                      return (
                        <TargetAllocationIntentCard key={`${intent.assetKey}-${intent.symbol}`} intent={intent} audit={audit} />
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--muted)]">
                    本轮没有可展示的资产目标。
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DaaSurfacePanel>
      ) : (
        <DaaSurfacePanel
          accent="primary"
          title="最新策略计划"
          subtitle="这里只展示会改变目标权重的策略输出。"
          bodyClassName="py-4"
        >
          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2">
            <div className="text-sm font-semibold text-[var(--text)]">暂无策略计划</div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
              输出目标权重后显示资产、比例和理由。
            </div>
          </div>
        </DaaSurfacePanel>
      )}

      <DaaSurfacePanel
        accent="warning"
        title="决策明细"
        subtitle="按时间排列复核依据和目标权重写入记录。"
        action={(
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 BTC、资产、复核批次..."
                className={`${daaSurfaceDenseFieldClassName} pl-8`}
              />
            </label>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <Filter className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
            {DECISION_KIND_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setDecisionKindFilter(item.value)}
                className={`h-8 shrink-0 rounded-[var(--radius-sm)] border px-3 text-xs font-medium transition-colors ${
                  decisionKindFilter === item.value
                    ? "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
            <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)]/70 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <ClipboardCheck className="h-4 w-4 text-[var(--primary)]" />
                  复核依据
                </div>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{filteredDecisionAudits.length}</span>
              </header>
              <div className="divide-y divide-[var(--border)]">
                {filteredDecisionAudits.length > 0 ? filteredDecisionAudits.slice(0, 80).map((audit) => (
                  <DecisionAuditRow key={audit.id} audit={audit} />
                )) : (
                  <div className="px-4 py-3 text-xs text-[var(--muted)]">没有匹配的复核依据。</div>
                )}
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)]/70 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <Target className="h-4 w-4 text-[var(--amber)]" />
                  目标权重写入
                </div>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{filteredTargetAudits.length}</span>
              </header>
              <div className="divide-y divide-[var(--border)]">
                {filteredTargetAudits.length > 0 ? filteredTargetAudits.slice(0, 60).map((audit) => (
                  <TargetWeightAuditRow key={audit.id} audit={audit} />
                )) : (
                  <div className="px-4 py-3 text-xs text-[var(--muted)]">没有匹配的目标权重写入记录。</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </DaaSurfacePanel>
    </div>
  );
}

function TargetAllocationIntentCard({ intent, audit }: { intent: TargetAllocationIntent; audit: DecisionAuditRecord | null }) {
  const currentWeightPct = readNumber(audit?.decisionPayload, "currentWeightPct");
  const currentTargetWeightPct = readNumber(audit?.decisionPayload, "currentTargetWeightPct");
  const reason = normalizeText(intent.reasoning) || normalizeText(audit?.reasoning);
  const href = intent.assetKey ? `/daa/dashboard/portfolio/${encodeURIComponent(intent.assetKey)}` : null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--elevated)]/50 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text)]">
            {assetDisplayName(intent.assetKey, intent.symbol)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
            {currentTargetWeightPct != null ? <span>原目标 {formatPercent(currentTargetWeightPct, 2)}</span> : null}
            {currentWeightPct != null ? <span>当前 {formatPercent(currentWeightPct, 2)}</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-[var(--font-mono)] text-lg font-semibold leading-none text-[var(--text)]">
            {formatPercent(intent.proposedTargetWeightPct, 2)}
          </div>
          <ConfidencePill value={intent.confidence} />
        </div>
      </div>
      {reason ? (
        <div className="mt-2 text-[13px] leading-5 text-[var(--muted)]">{reason}</div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--amber)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          未记录单资产理由
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--faint)]">
        <span>审计 {audit ? compactId(audit.id) : "-"}</span>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-[var(--primary)] hover:text-[var(--text)]">
            资产详情 <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ConfidencePill({ value }: { value: number | null | undefined }) {
  const tone = toneForConfidence(value);
  const className = tone === "success"
    ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
    : tone === "warning"
      ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]"
      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]";
  return (
    <div className={`mt-1 inline-flex rounded-[var(--radius-sm)] border px-2 py-0.5 font-[var(--font-mono)] text-[10px] ${className}`}>
      {confidenceLabel(value)}
    </div>
  );
}

function DecisionAuditRow({ audit }: { audit: DecisionAuditRecord }) {
  const asset = normalizeText(audit.assetKey) ? assetDisplayName(audit.assetKey, audit.symbol) : null;
  const proposedTargetWeightPct = readNumber(audit.decisionPayload, "proposedTargetWeightPct");
  const currentTargetWeightPct = readNumber(audit.decisionPayload, "currentTargetWeightPct");
  const currentWeightPct = readNumber(audit.decisionPayload, "currentWeightPct");

  return (
    <article className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            {formatDecisionKind(audit.decisionKind)}
          </span>
          {asset ? <span className="truncate text-sm font-medium text-[var(--text)]">{asset}</span> : null}
        </div>
        <span className="shrink-0 font-[var(--font-mono)] text-[10px] text-[var(--faint)]">{formatDateTime(audit.createdAt)}</span>
      </div>

      {audit.summary ? <div className="mt-1.5 text-sm leading-5 text-[var(--text)]">{audit.summary}</div> : null}
      {audit.reasoning ? <div className="mt-1 text-[13px] leading-5 text-[var(--muted)]">{audit.reasoning}</div> : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--faint)]">
        {proposedTargetWeightPct != null ? <MetricChip label="目标" value={formatPercent(proposedTargetWeightPct, 2)} /> : null}
        {currentTargetWeightPct != null ? <MetricChip label="原目标" value={formatPercent(currentTargetWeightPct, 2)} /> : null}
        {currentWeightPct != null ? <MetricChip label="当前" value={formatPercent(currentWeightPct, 2)} /> : null}
        {audit.confidencePct != null ? <MetricChip label="置信" value={confidenceLabel(audit.confidencePct)} /> : null}
        {audit.agentRunId ? <MetricChip label="复核批次" value={compactId(audit.agentRunId)} /> : null}
        {audit.cycleId ? <MetricChip label="周期" value={compactId(audit.cycleId)} /> : null}
      </div>
    </article>
  );
}

function TargetWeightAuditRow({ audit }: { audit: TargetWeightAuditRecord }) {
  const href = `/daa/dashboard/portfolio/${encodeURIComponent(audit.assetKey)}`;
  return (
    <article className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="truncate text-sm font-medium text-[var(--text)] hover:text-[var(--primary)]">
            {assetDisplayName(audit.assetKey, audit.symbol)}
          </Link>
          <div className="mt-1 font-[var(--font-mono)] text-xs font-semibold text-[var(--text)]">
            {formatWeightChange(audit)}
          </div>
        </div>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" />
      </div>
      {audit.reason ? <div className="mt-1.5 text-[13px] leading-5 text-[var(--muted)]">{audit.reason}</div> : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[var(--faint)]">
        <MetricChip label="时间" value={formatDateTime(audit.createdAt)} />
        {audit.agentRunId ? <MetricChip label="复核批次" value={compactId(audit.agentRunId)} /> : null}
        {audit.cycleId ? <MetricChip label="周期" value={compactId(audit.cycleId)} /> : null}
      </div>
    </article>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--elevated)] px-1.5 py-0.5">
      <span className="text-[var(--faint)]">{label}</span>
      <span className="font-[var(--font-mono)] text-[var(--muted)]">{value}</span>
    </span>
  );
}
