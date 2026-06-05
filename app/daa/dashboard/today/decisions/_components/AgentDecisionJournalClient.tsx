"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Workflow,
} from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceMiniStat,
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

type TargetIntent = {
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
    intents: TargetIntent[];
  } | null;
};

type AgentDecisionAudit = {
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

type TargetWeightAudit = {
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

type DecisionJournalPayload = {
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
  decisionAudits: AgentDecisionAudit[];
  targetWeightAudits: TargetWeightAudit[];
};

type KindFilter = "all" | DecisionKind;

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "strategy_target_allocation", label: "目标权重" },
  { value: "strategy_plan_summary", label: "计划摘要" },
  { value: "strategy_regime_override", label: "市场状态" },
  { value: "thesis_review", label: "论点复盘" },
  { value: "human_daily_decision", label: "人的拍板" },
];

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatRunStatus(status: string): string {
  if (status === "completed") return "完成";
  if (status === "completed_with_errors") return "完成，有错误";
  if (status === "failed") return "失败";
  if (status === "running") return "运行中";
  return status || "-";
}

function formatTrigger(trigger: string): string {
  if (trigger === "scheduled") return "定时";
  if (trigger === "manual") return "手动";
  if (trigger === "event_driven") return "事件";
  return trigger || "-";
}

function formatDecisionKind(kind: DecisionKind): string {
  if (kind === "strategy_target_allocation") return "目标权重";
  if (kind === "strategy_regime_override") return "市场状态";
  if (kind === "strategy_plan_summary") return "计划摘要";
  if (kind === "thesis_review") return "论点复盘";
  if (kind === "human_daily_decision") return "人的拍板";
  return kind;
}

function toneForConfidence(value: number | null | undefined): "green" | "amber" | "slate" {
  const confidence = Number(value);
  if (Number.isFinite(confidence) && confidence >= 80) return "green";
  if (Number.isFinite(confidence) && confidence >= 60) return "amber";
  return "slate";
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

function findLatestAuditForIntent(intent: TargetIntent, audits: AgentDecisionAudit[]): AgentDecisionAudit | null {
  const key = intent.assetKey.trim().toUpperCase();
  const symbol = intent.symbol.trim().toUpperCase();
  return audits.find((audit) => {
    if (audit.decisionKind !== "strategy_target_allocation") return false;
    const auditKey = normalizeText(audit.assetKey).toUpperCase();
    const auditSymbol = normalizeText(audit.symbol).toUpperCase();
    return (key && auditKey === key) || (symbol && auditSymbol === symbol);
  }) ?? null;
}

function filterDecisionAudits(audits: AgentDecisionAudit[], kind: KindFilter, query: string): AgentDecisionAudit[] {
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

function filterTargetWeightAudits(audits: TargetWeightAudit[], query: string): TargetWeightAudit[] {
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

function formatWeightChange(audit: TargetWeightAudit): string {
  const prev = audit.previousTargetWeightPct == null ? "未设置" : formatPercent(audit.previousTargetWeightPct, 2);
  return `${prev} -> ${formatPercent(audit.nextTargetWeightPct, 2)}`;
}

function readJsonData(value: unknown): DecisionJournalPayload | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as { data?: unknown };
  if (!envelope.data || typeof envelope.data !== "object") return null;
  return envelope.data as DecisionJournalPayload;
}

export default function AgentDecisionJournalClient() {
  const [data, setData] = useState<DecisionJournalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/daa/agent/decision-journal", { cache: "no-store" });
      if (!res.ok) return;
      const json = readJsonData(await res.json());
      if (json) setData(json);
    } catch (error) {
      logSwallowed("agentDecisionJournal.load", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latestOverlay = data?.latestRun?.strategyOverlay ?? null;
  const latestPlan = latestOverlay?.targetAllocationPlan ?? null;
  const targetIntents = latestPlan?.intents ?? [];
  const targetAudits = data?.targetWeightAudits ?? [];
  const decisionAudits = data?.decisionAudits ?? [];
  const filteredDecisionAudits = useMemo(
    () => filterDecisionAudits(decisionAudits, kind, query),
    [decisionAudits, kind, query],
  );
  const filteredTargetAudits = useMemo(
    () => filterTargetWeightAudits(targetAudits, query),
    [targetAudits, query],
  );

  if (loading) {
    return (
      <DaaSurfacePanel accent="indigo" title="Agent 决策记录">
        <div className="flex items-center justify-center py-16 text-[var(--muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载决策记录...
        </div>
      </DaaSurfacePanel>
    );
  }

  const latestRun = data?.latestRun ?? null;
  const targetDecisionCount = decisionAudits.filter((audit) => audit.decisionKind === "strategy_target_allocation").length;

  return (
    <div className="space-y-5">
      <DaaSurfacePanel
        accent="indigo"
        title="Agent 决策记录"
        subtitle="按运行批次、目标权重和审计流水追溯 Agent 的投资判断。"
        action={(
          <DaaSurfaceActionButton tone="slate" className="h-8 px-2.5 text-xs" onClick={() => void load("refresh")} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新
          </DaaSurfaceActionButton>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DaaSurfaceMiniStat
            label="最新运行"
            value={latestRun ? formatRunStatus(latestRun.status) : "-"}
            hint={latestRun ? `${formatTrigger(latestRun.trigger)} · ${formatDateTime(latestRun.createdAt)}` : "暂无 Agent 运行"}
            tone={latestRun?.status === "failed" ? "red" : "indigo"}
          />
          <DaaSurfaceMiniStat
            label="本轮目标"
            value={targetIntents.length}
            hint={targetIntents.length > 0 ? "最新策略计划中的资产意图" : "本轮未输出目标权重"}
            tone={targetIntents.length > 0 ? "green" : "slate"}
          />
          <DaaSurfaceMiniStat
            label="决策审计"
            value={decisionAudits.length}
            hint={targetDecisionCount > 0 ? `${targetDecisionCount} 条目标权重理由` : "暂无目标权重理由"}
            tone="cyan"
          />
          <DaaSurfaceMiniStat
            label="权重流水"
            value={targetAudits.length}
            hint={targetAudits.length > 0 ? "Agent 写入目标权重池" : "暂无 Agent 权重写入"}
            tone={targetAudits.length > 0 ? "amber" : "slate"}
          />
        </div>
      </DaaSurfacePanel>

      {latestOverlay ? (
        <DaaSurfacePanel
          accent="cyan"
          title="最新策略计划"
          subtitle={latestRun ? `Run ${compactId(latestRun.id)} · ${formatDateTime(latestOverlay.generatedAt || latestRun.createdAt)}` : undefined}
        >
          <div className="space-y-4">
            {latestOverlay.regimeOverride ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Workflow className="h-4 w-4 text-[var(--primary)]" />
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {latestOverlay.regimeOverride.ruleBasedRegime}{" -> "}{latestOverlay.regimeOverride.suggestedRegime}
                  </span>
                  <span className="rounded-full border border-[var(--primary-border)] bg-[var(--primary-bg)] px-2 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--primary)]">
                    {confidenceLabel(latestOverlay.regimeOverride.confidence)}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{latestOverlay.regimeOverride.reasoning}</div>
              </div>
            ) : null}

            {latestPlan ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <Target className="h-4 w-4 text-[var(--success)]" />
                  目标权重计划
                </div>
                {latestPlan.reasoning ? (
                  <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{latestPlan.reasoning}</div>
                ) : null}
                {targetIntents.length > 0 ? (
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {targetIntents.map((intent) => {
                      const audit = findLatestAuditForIntent(intent, decisionAudits);
                      return (
                        <TargetIntentCard key={`${intent.assetKey}-${intent.symbol}`} intent={intent} audit={audit} />
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-3 py-4 text-center text-xs text-[var(--muted)]">
                    本轮没有可展示的资产目标。
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DaaSurfacePanel>
      ) : (
        <DaaSurfacePanel
          accent="cyan"
          title="最新策略计划"
          subtitle="这里只展示会改变目标权重的策略输出。"
          bodyClassName="py-4"
        >
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-4 py-8 text-center">
            <div className="text-sm font-semibold text-[var(--text)]">暂无策略计划</div>
            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Agent 完成一次带目标权重的运行后，这里会出现资产、目标比例和理由。
            </div>
          </div>
        </DaaSurfacePanel>
      )}

      <DaaSurfacePanel
        accent="amber"
        title="审计流水"
        subtitle="上方是最新结论，下方是按时间排列的原始审计线索。"
        action={(
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 BTC、assetKey、run..."
                className={`${daaSurfaceDenseFieldClassName} pl-8`}
              />
            </label>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <Filter className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
            {KIND_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setKind(item.value)}
                className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors ${
                  kind === item.value
                    ? "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
            <section className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)]/70 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <BrainCircuit className="h-4 w-4 text-[var(--primary)]" />
                  决策审计
                </div>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{filteredDecisionAudits.length}</span>
              </header>
              <div className="divide-y divide-[var(--border)]">
                {filteredDecisionAudits.length > 0 ? filteredDecisionAudits.slice(0, 80).map((audit) => (
                  <DecisionAuditRow key={audit.id} audit={audit} />
                )) : (
                  <div className="px-4 py-10 text-center text-xs text-[var(--muted)]">没有匹配的决策审计。</div>
                )}
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
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
                  <div className="px-4 py-10 text-center text-xs text-[var(--muted)]">没有匹配的目标权重写入记录。</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </DaaSurfacePanel>
    </div>
  );
}

function TargetIntentCard({ intent, audit }: { intent: TargetIntent; audit: AgentDecisionAudit | null }) {
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
        <span>Audit {audit ? compactId(audit.id) : "-"}</span>
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
  const className = tone === "green"
    ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
    : tone === "amber"
      ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]"
      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]";
  return (
    <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 font-[var(--font-mono)] text-[10px] ${className}`}>
      {confidenceLabel(value)}
    </div>
  );
}

function DecisionAuditRow({ audit }: { audit: AgentDecisionAudit }) {
  const asset = normalizeText(audit.assetKey) ? assetDisplayName(audit.assetKey, audit.symbol) : null;
  const proposedTargetWeightPct = readNumber(audit.decisionPayload, "proposedTargetWeightPct");
  const currentTargetWeightPct = readNumber(audit.decisionPayload, "currentTargetWeightPct");
  const currentWeightPct = readNumber(audit.decisionPayload, "currentWeightPct");

  return (
    <article className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
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
        {audit.agentRunId ? <MetricChip label="Run" value={compactId(audit.agentRunId)} /> : null}
        {audit.cycleId ? <MetricChip label="Cycle" value={compactId(audit.cycleId)} /> : null}
      </div>
    </article>
  );
}

function TargetWeightAuditRow({ audit }: { audit: TargetWeightAudit }) {
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
        {audit.agentRunId ? <MetricChip label="Run" value={compactId(audit.agentRunId)} /> : null}
        {audit.cycleId ? <MetricChip label="Cycle" value={compactId(audit.cycleId)} /> : null}
      </div>
    </article>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] px-1.5 py-0.5">
      <span className="text-[var(--faint)]">{label}</span>
      <span className="font-[var(--font-mono)] text-[var(--muted)]">{value}</span>
    </span>
  );
}
