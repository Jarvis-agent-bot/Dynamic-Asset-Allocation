export type DaaNotificationSeverity = "critical" | "actionable" | "info" | "debug";
export type DaaNotificationCategory = "risk" | "rebalance" | "portfolio" | "market" | "system" | "trade" | "test";

export type DaaNotificationFact = {
  label: string;
  value: string;
};

export type DaaNotificationEvent = {
  kind?: "risk_alert" | "review_required" | "execution_update" | "daily_digest" | "system_alert";
  severity: DaaNotificationSeverity;
  category: DaaNotificationCategory;
  title: string;
  status: string;
  summary?: string | null;
  facts?: DaaNotificationFact[];
  highlights?: string[];
  nextAction?: string | null;
  source?: string | null;
  occurredAt?: string | Date | null;
};

type AgentDecisionSnapshot = {
  status: string;
  summary: string;
  keyRisks: string[];
  keyOpportunities: string[];
  overallConfidence: number;
};

type RiskAgentReview = {
  attempted: boolean;
  skipped: boolean;
  reason: string | null;
  runId: string | null;
  cycleId: string | null;
  proposalCount: number;
  error?: string | null;
};

const SEVERITY_LABELS: Record<DaaNotificationSeverity, string> = {
  critical: "紧急",
  actionable: "行动",
  info: "摘要",
  debug: "调试",
};

const CATEGORY_LABELS: Record<DaaNotificationCategory, string> = {
  risk: "风控",
  rebalance: "调仓",
  portfolio: "组合",
  market: "市场",
  system: "系统",
  trade: "交易",
  test: "测试",
};

function compactText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function formatOccurredAt(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(/\//g, "-");
}

function formatNotional(value: number): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function triggerLabel(triggerType: "stop_loss" | "take_profit"): string {
  return triggerType === "stop_loss" ? "止损" : "止盈";
}

function riskReviewStatus(review: RiskAgentReview | null | undefined): string {
  if (!review || !review.attempted) return "已触发，等待即时审核";
  if (review.error) return `即时审核失败：${compactText(review.error)}`;
  if (review.proposalCount > 0) return `已完成即时审核，生成 ${review.proposalCount} 条建议`;
  if (review.skipped) return `已完成即时审核，未生成新建议：${compactText(review.reason || "无可执行项")}`;
  return `已完成即时审核，未生成新建议：${compactText(review.reason || "无可执行项")}`;
}

export function buildDaaNotificationText(event: DaaNotificationEvent): string {
  const lines: string[] = [];
  const severity = SEVERITY_LABELS[event.severity] ?? SEVERITY_LABELS.info;
  const category = CATEGORY_LABELS[event.category] ?? CATEGORY_LABELS.system;
  const title = compactText(event.title) || "通知";
  const status = compactText(event.status);

  lines.push(`[${severity}] ${category} | ${title}`);
  lines.push("");
  if (status) lines.push(`状态: ${status}`);
  if (event.summary) lines.push(`摘要: ${compactText(event.summary)}`);

  const facts = (event.facts ?? [])
    .map((fact) => ({ label: compactText(fact.label), value: compactText(fact.value) }))
    .filter((fact) => fact.label && fact.value);
  for (const fact of facts.slice(0, 8)) {
    lines.push(`${fact.label}: ${fact.value}`);
  }

  const highlights = (event.highlights ?? []).map(compactText).filter(Boolean);
  if (highlights.length > 0) {
    lines.push("");
    lines.push("重点:");
    for (const item of highlights.slice(0, 8)) {
      lines.push(`- ${item}`);
    }
    if (highlights.length > 8) {
      lines.push(`- 其余 ${highlights.length - 8} 项已省略。`);
    }
  }

  if (event.nextAction) {
    lines.push("");
    lines.push(`下一步: ${compactText(event.nextAction)}`);
  }

  const footer: string[] = [];
  if (event.source) footer.push(compactText(event.source));
  const occurredAt = formatOccurredAt(event.occurredAt ?? new Date());
  if (occurredAt) footer.push(`${occurredAt} CST`);
  if (footer.length > 0) {
    lines.push("");
    lines.push(`来源: ${footer.join(" · ")}`);
  }

  return lines.join("\n");
}

export function buildRebalanceSuggestionNotificationText(input: {
  cycleId: string;
  triggerReason: string;
  riskStatus: string;
  proposals: Array<{ symbol: string; side: "BUY" | "SELL"; suggestedNotional: number }>;
  agentDecisionSnapshot?: AgentDecisionSnapshot | null;
  source?: string | null;
  occurredAt?: string | Date | null;
}): string {
  const snap = input.agentDecisionSnapshot;
  const facts: DaaNotificationFact[] = [
    { label: "周期", value: input.cycleId },
    { label: "触发", value: input.triggerReason },
  ];
  if (snap && snap.status === "ok" && snap.summary) {
    facts.push({ label: "模型", value: snap.summary.slice(0, 120) });
    if (snap.keyRisks.length > 0) facts.push({ label: "风险", value: snap.keyRisks.slice(0, 2).join("; ") });
    if (snap.keyOpportunities.length > 0) facts.push({ label: "机会", value: snap.keyOpportunities.slice(0, 2).join("; ") });
    facts.push({ label: "置信度", value: `${snap.overallConfidence}%` });
  }

  const highlights = input.proposals.length > 0
    ? input.proposals.map((row) => `${row.symbol} ${row.side === "BUY" ? "买入" : "卖出"} ${formatNotional(row.suggestedNotional)}`)
    : ["当前无建议交易。"];

  return buildDaaNotificationText({
    severity: "actionable",
    category: "rebalance",
    kind: "review_required",
    title: "调仓建议已生成",
    status: `已生成 ${input.proposals.length} 条建议，风控 ${input.riskStatus}`,
    facts,
    highlights,
    nextAction: "请在工作台审核建议；若自动执行获授权，成交结果会单独推送。",
    source: input.source ?? "daily-analysis",
    occurredAt: input.occurredAt,
  });
}

export function buildDriftNotificationText(input: {
  newCycleCreated: boolean;
  cycleId: string | null;
  reason: string;
  driftedAssetCount: number;
  driftLines: string[];
  proposalCount: number;
  riskStatus: string | null;
  source?: string | null;
  occurredAt?: string | Date | null;
}): string {
  if (input.newCycleCreated && input.cycleId) {
    return buildDaaNotificationText({
      severity: "actionable",
      category: "rebalance",
      kind: "review_required",
      title: "调仓建议已生成",
      status: `已生成调仓周期 ${input.cycleId}`,
      facts: [
        { label: "触发", value: "偏移越界" },
        { label: "偏移标的", value: `${input.driftedAssetCount} 个` },
        { label: "建议", value: `${input.proposalCount} 条` },
        ...(input.riskStatus ? [{ label: "风控", value: input.riskStatus }] : []),
      ],
      highlights: input.driftLines,
      nextAction: "请优先审核本轮调仓建议；若自动执行获授权，成交结果会单独推送。",
      source: input.source ?? "drift-check",
      occurredAt: input.occurredAt,
    });
  }

  return buildDaaNotificationText({
    severity: "info",
    category: "rebalance",
    kind: "daily_digest",
    title: "偏移越界记录",
    status: `未生成新周期：${compactText(input.reason || "无新调仓动作")}`,
    facts: [{ label: "偏移标的", value: `${input.driftedAssetCount} 个` }],
    highlights: input.driftLines,
    nextAction: "已纳入每日复核/投资助理简报，无需单独处理。",
    source: input.source ?? "drift-check",
    occurredAt: input.occurredAt,
  });
}

export function buildRiskTriggerNotificationText(input: {
  stopLossCount: number;
  takeProfitCount: number;
  ignoredCount: number;
  assets: Array<{ label: string; triggerType: "stop_loss" | "take_profit"; pnlPct: number }>;
  agentReview?: RiskAgentReview | null;
  source?: string | null;
  occurredAt?: string | Date | null;
}): string {
  const review = input.agentReview ?? null;
  const facts: DaaNotificationFact[] = [
    { label: "触发", value: `止损 ${input.stopLossCount} 项 / 止盈 ${input.takeProfitCount} 项` },
  ];
  if (input.ignoredCount > 0) {
    facts.push({ label: "尘埃仓", value: `已忽略 ${input.ignoredCount} 项` });
  }
  if (review?.runId) facts.push({ label: "审核 Run", value: review.runId });
  if (review?.cycleId) facts.push({ label: "风险周期", value: review.cycleId });

  let nextAction = "请查看工作台风险复核结果。";
  if (review?.cycleId) {
    nextAction = `请优先查看风险调仓周期 ${review.cycleId}。`;
  } else if (review?.proposalCount === 0 && review.attempted && !review.error) {
    nextAction = "本轮未生成调仓建议；继续观察，后续每日复核会跟踪。";
  } else if (review?.error) {
    nextAction = "请检查投资助理运行日志，必要时手动复核风险标的。";
  }

  return buildDaaNotificationText({
    severity: "critical",
    category: "risk",
    kind: "risk_alert",
    title: "止盈/止损触发",
    status: riskReviewStatus(review),
    facts,
    highlights: input.assets.map((asset) => `${asset.label}: ${triggerLabel(asset.triggerType)} ${asset.pnlPct.toFixed(1)}%`),
    nextAction,
    source: input.source ?? "drift-check",
    occurredAt: input.occurredAt,
  });
}
