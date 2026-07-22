/**
 * Briefing Presenter — DailyBriefing 的展示层
 *
 * 把 DailyBriefing 归一化成结构化板块（presentBriefing），再按渠道渲染：
 * - formatBriefingForTelegram: TG HTML 推送
 * - formatBriefingForChat: Web/TG 对话查询的纯文本
 *
 * 设计原则：TG 简报是"复核报告"。只在需要人介入（高优先级变化 / 目标权重计划 /
 * regime 覆盖建议）时展开完整简报，否则降级为三行摘要；投资助理的工作过程细节
 * （投资判断数、会话摘要数、覆盖遥测）属于 Web 端，不进推送。
 */

import type { DailyBriefing, Surprise, CognitionGap, MindChangeCondition } from "@/src/daa/agent/cognitiveTypes";
import { formatAssetLabel, formatAssetLabelByKey } from "@/src/daa/assetRegistry";

// ── 文本截断（fallback 安全网；首选在 prompt 层约束 LLM 输出长度） ──

function normalizeBriefingText(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function formatBriefingTextExcerpt(text: string, charLimit: number): string {
  const normalized = normalizeBriefingText(text);
  if (normalized.length <= charLimit) return normalized;

  const head = normalized.slice(0, charLimit);
  const minBoundary = Math.max(24, Math.floor(charLimit * 0.45));
  let boundary = -1;

  for (let i = head.length - 1; i >= minBoundary; i -= 1) {
    const ch = head[i];
    if ("。！？；;!?".includes(ch)) {
      boundary = i + 1;
      break;
    }
    if (ch === "." && !/\d/.test(head[i - 1] || "") && !/\d/.test(normalized[i + 1] || "")) {
      boundary = i + 1;
      break;
    }
  }

  if (boundary < 0) {
    for (let i = head.length - 1; i >= minBoundary; i -= 1) {
      if ("，,、 ".includes(head[i])) {
        boundary = i;
        break;
      }
    }
  }

  const clipped = (boundary > 0 ? head.slice(0, boundary) : head).trim();
  return clipped.endsWith("…") ? clipped : `${clipped}…`;
}

// ── 类型 ──

export interface BriefingPortfolioMeta {
  holdings: Array<{
    assetKey: string;
    symbol: string;
    weightPct: number;
    lastPrice: number;
    unrealizedPnlPct: number | null;
    holdingQty: number;
    targetWeightHint?: number;
    gapPct?: number | null;
    valuationBase?: number | null;
    /** 基准货币未实现盈亏；优先用于推送的美元贡献归因。 */
    unrealizedPnlBase?: number | null;
  }>;
  totalEquity: number;
  cashPct: number;
  cash?: number;
  marketRegime?: string;
}

export interface BriefingRenderMeta {
  portfolio?: BriefingPortfolioMeta;
}

export interface BriefingActionItem {
  kind: "surprise_review" | "plan_review" | "regime_override";
  text: string;
}

/** 风险暴露 + 投资判断不一致合并后的资产维度视图 */
export interface AssetThesisRiskGroup {
  assetKey: string;
  weightPct: number;
  riskLevelLabel: string | null;
  topImpact: { thesisTitle: string; totalExposurePct: number } | null;
  impactCount: number;
  conflictPairs: Array<{ titleA: string; titleB: string }>;
}

export interface BriefingPresentation {
  mode: "digest" | "full";
  actions: BriefingActionItem[];
  surprises: Surprise[];
  dueForReview: CognitionGap[];
  mindChangeConditions: MindChangeCondition[];
  thesisRisks: AssetThesisRiskGroup[];
  plan: {
    regimeOverride: { from: string; to: string; confidence: number } | null;
    intents: Array<{ label: string; targetPct: number; confidence: number }>;
    reasoning: string | null;
  } | null;
  /** 仅当自动复核产生实际动作（已设目标 / 已接受计划）时非 null */
  autopilotLine: string | null;
  counts: { surprises: number; dueForReview: number; riskAssets: number };
}

/** severity 达到该阈值的变化才进入"今日待办"并触发完整简报 */
export const BRIEFING_ACTION_SEVERITY = 7;

const RISK_LEVEL_LABEL: Record<string, string> = { critical: "严重", high: "高", medium: "中" };

// ── 归一化 ──

function groupThesisRisksByAsset(briefing: DailyBriefing, portfolio?: BriefingPortfolioMeta | null): AssetThesisRiskGroup[] {
  const weightByAsset = new Map<string, number>();
  for (const h of portfolio?.holdings ?? []) weightByAsset.set(h.assetKey, h.weightPct);

  const groups = new Map<string, AssetThesisRiskGroup>();
  const ensure = (assetKey: string, fallbackWeight = 0): AssetThesisRiskGroup => {
    let g = groups.get(assetKey);
    if (!g) {
      g = {
        assetKey,
        weightPct: weightByAsset.get(assetKey) ?? fallbackWeight,
        riskLevelLabel: null,
        topImpact: null,
        impactCount: 0,
        conflictPairs: [],
      };
      groups.set(assetKey, g);
    }
    return g;
  };

  const rank = (level: string) => (level === "critical" ? 3 : level === "high" ? 2 : level === "medium" ? 1 : 0);

  // 风险暴露：medium 及以上
  for (const impact of briefing.thesisFailureImpacts ?? []) {
    if (rank(impact.riskLevel) < 1) continue;
    for (const asset of impact.affectedAssets) {
      const g = ensure(asset.assetKey, asset.weightPct);
      g.impactCount += 1;
      if (!g.topImpact || impact.totalExposurePct > g.topImpact.totalExposurePct) {
        g.topImpact = { thesisTitle: impact.thesisTitle, totalExposurePct: impact.totalExposurePct };
      }
      const label = RISK_LEVEL_LABEL[impact.riskLevel] ?? null;
      if (label && (!g.riskLevelLabel || rank(impact.riskLevel) > rank(
        g.riskLevelLabel === "严重" ? "critical" : g.riskLevelLabel === "高" ? "high" : "medium",
      ))) {
        g.riskLevelLabel = label;
      }
    }
  }

  // 投资判断不一致：只保留 severity=high 的，作为资产组的注解（不再独立成板块）
  for (const conflict of briefing.thesisConflicts ?? []) {
    if (conflict.severity !== "high") continue;
    for (const assetKey of conflict.overlappingAssets) {
      const g = ensure(assetKey);
      if (g.conflictPairs.length < 2) {
        g.conflictPairs.push({ titleA: conflict.thesisA.title, titleB: conflict.thesisB.title });
      }
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, 4);
}

export function presentBriefing(briefing: DailyBriefing, portfolio?: BriefingPortfolioMeta | null): BriefingPresentation {
  const surprises = (briefing.surprises ?? []).slice(0, 3);
  const dueForReview = (briefing.cognitionGaps ?? []).slice(0, 3);
  const mindChangeConditions = (briefing.mindChangeConditions ?? []).slice(0, 2);
  const thesisRisks = groupThesisRisksByAsset(briefing, portfolio);

  const ov = briefing.strategyOverlay ?? null;
  const rawIntents = ov?.targetAllocationPlan?.intents ?? [];
  const plan = (ov?.regimeOverride || rawIntents.length > 0)
    ? {
      regimeOverride: ov?.regimeOverride
        ? { from: ov.regimeOverride.ruleBasedRegime, to: ov.regimeOverride.suggestedRegime, confidence: ov.regimeOverride.confidence }
        : null,
      intents: rawIntents.slice(0, 4).map(i => ({
        label: i.symbol || formatAssetLabelByKey(i.assetKey),
        targetPct: i.proposedTargetWeightPct,
        confidence: i.confidence,
      })),
      reasoning: ov?.targetAllocationPlan?.reasoning ? formatBriefingTextExcerpt(ov.targetAllocationPlan.reasoning, 160) : null,
    }
    : null;

  // 今日待办：需要人介入的事，决定 digest/full
  const actions: BriefingActionItem[] = [];
  for (const s of (briefing.surprises ?? [])) {
    if (s.severityScore >= BRIEFING_ACTION_SEVERITY) {
      actions.push({
        kind: "surprise_review",
        text: `[${s.severityScore}/10] 复核「${s.title}」${s.suggestedAction ? ` — ${formatBriefingTextExcerpt(s.suggestedAction, 40)}` : ""}`,
      });
    }
  }
  if (plan?.intents.length) {
    const head = plan.intents.slice(0, 2).map(i => `${i.label}→${i.targetPct.toFixed(1)}%`).join("、");
    actions.push({
      kind: "plan_review",
      text: `复核目标权重计划 ${rawIntents.length} 条：${head}${rawIntents.length > 2 ? " 等" : ""}`,
    });
  }
  if (plan?.regimeOverride) {
    actions.push({
      kind: "regime_override",
      text: `Regime 建议调整：${plan.regimeOverride.from} → ${plan.regimeOverride.to} (${plan.regimeOverride.confidence}%)`,
    });
  }

  // 自动复核覆盖：纯遥测，只在产生实际动作时上报一行
  const c = briefing.autopilotCoverage;
  const autopilotLine = c && (c.watchlistTargetedAssets > 0 || c.acceptedBrainPlanIntents > 0)
    ? `已设目标 ${c.watchlistTargetedAssets} 个 | 目标计划已接受 ${c.acceptedBrainPlanIntents}/${c.brainPlanIntents} 条`
    : null;

  return {
    mode: actions.length > 0 ? "full" : "digest",
    actions,
    surprises,
    dueForReview,
    mindChangeConditions,
    thesisRisks,
    plan,
    autopilotLine,
    counts: {
      surprises: (briefing.surprises ?? []).length,
      dueForReview: (briefing.cognitionGaps ?? []).length,
      riskAssets: thesisRisks.length,
    },
  };
}

// ── 渲染辅助 ──

function fmtUsd(v: number): string {
  const rounded = Math.round(Math.abs(Number.isFinite(v) ? v : 0));
  return `${v < 0 ? "-" : ""}$${rounded.toLocaleString("en-US")}`;
}

function resolveHoldingPnlBase(h: BriefingPortfolioMeta["holdings"][number]): number | null {
  if (h.unrealizedPnlBase != null && Number.isFinite(h.unrealizedPnlBase)) {
    return h.unrealizedPnlBase;
  }
  const value = Number(h.valuationBase);
  const pct = Number(h.unrealizedPnlPct);
  if (!(value > 0) || !Number.isFinite(pct) || pct <= -1) return null;
  return value - value / (1 + pct);
}

function formatContribution(h: BriefingPortfolioMeta["holdings"][number], pnl: number): string {
  const signed = pnl >= 0 ? `+${fmtUsd(pnl)}` : fmtUsd(pnl);
  return `${formatAssetLabel({ symbol: h.symbol, assetKey: h.assetKey })} ${signed}`;
}

function portfolioOverviewLines(p: BriefingPortfolioMeta): string[] {
  const cashPct = Math.max(0, Math.min(1, Number(p.cashPct) || 0));
  const holdingsPct = Math.max(0, 1 - cashPct);
  const lines = [
    `权益 <code>${fmtUsd(p.totalEquity)}</code> · 持仓 <code>${(holdingsPct * 100).toFixed(0)}%</code> · 现金 <code>${(cashPct * 100).toFixed(0)}%</code>`,
  ];

  const contributions = p.holdings
    .map((holding) => ({ holding, pnl: resolveHoldingPnlBase(holding) }))
    .filter((item): item is { holding: BriefingPortfolioMeta["holdings"][number]; pnl: number } => item.pnl != null);
  if (contributions.length === 0) return lines;

  const totalPnl = contributions.reduce((sum, item) => sum + item.pnl, 0);
  const accountPct = p.totalEquity > 0 ? totalPnl / p.totalEquity : 0;
  lines.push(`浮盈亏 <code>${fmtUsd(totalPnl)}</code>（账户 ${accountPct >= 0 ? "+" : ""}${(accountPct * 100).toFixed(2)}%）`);

  const winners = contributions.filter((item) => item.pnl >= 1).sort((a, b) => b.pnl - a.pnl).slice(0, 2);
  const losers = contributions.filter((item) => item.pnl <= -1).sort((a, b) => a.pnl - b.pnl).slice(0, 2);
  const parts: string[] = [];
  if (winners.length > 0) parts.push(winners.map((item) => formatContribution(item.holding, item.pnl)).join("、"));
  if (losers.length > 0) parts.push(losers.map((item) => formatContribution(item.holding, item.pnl)).join("、"));
  if (parts.length > 0) lines.push(`主要：${parts.join("｜")}`);
  return lines;
}

function renderAssetRiskLine(g: AssetThesisRiskGroup): string[] {
  const weightText = g.weightPct > 0 ? ` ${(g.weightPct * 100).toFixed(1)}%` : "";
  const parts: string[] = [];
  if (g.topImpact) {
    parts.push(`风险判断 ${g.impactCount} 个（最高「${g.topImpact.thesisTitle}」暴露 ${(g.topImpact.totalExposurePct * 100).toFixed(1)}%）`);
  }
  if (g.conflictPairs.length > 0) {
    parts.push(`方向不一致 ${g.conflictPairs.length} 组`);
  }
  const lines = [`• ${g.riskLevelLabel ? `[${g.riskLevelLabel}] ` : ""}${formatAssetLabelByKey(g.assetKey)}${weightText} — ${parts.join("；")}`];
  if (g.conflictPairs[0]) {
    lines.push(`  ↳ 「${g.conflictPairs[0].titleA}」×「${g.conflictPairs[0].titleB}」`);
  }
  return lines;
}

// ── Telegram HTML ──

export function formatBriefingForTelegram(briefing: DailyBriefing, meta: BriefingRenderMeta = {}): string {
  const p = presentBriefing(briefing, meta.portfolio ?? null);
  const lines: string[] = [];

  if (p.mode === "digest") {
    lines.push("<b>\u{1F9ED} 组合日报</b> · 今日无需操作");
    if (meta.portfolio) lines.push(...portfolioOverviewLines(meta.portfolio));
    const watching: string[] = [];
    if (p.counts.surprises > 0) watching.push(`变化 ${p.counts.surprises} 条`);
    if (p.counts.dueForReview > 0) watching.push(`投资判断复核 ${p.counts.dueForReview} 个`);
    if (p.counts.riskAssets > 0) watching.push(`投资判断风险 ${p.counts.riskAssets} 项`);
    if (watching.length > 0) {
      lines.push(`观察：${watching.join(" · ")} · 详情见 Web`);
    } else if (!meta.portfolio) {
      lines.push("今日平稳，无观察项。");
    }
    return lines.join("\n");
  }

  lines.push("<b>\u{1F9ED} 组合日报</b>");
  lines.push(`<b>\u{1F4CC} 需处理 ${p.actions.length} 项</b>`);
  for (const a of p.actions.slice(0, 3)) lines.push(`• ${a.text}`);
  if (p.plan?.reasoning) lines.push(`  ↳ ${p.plan.reasoning}`);

  if (meta.portfolio) {
    lines.push("");
    lines.push(...portfolioOverviewLines(meta.portfolio));
  }

  if (p.autopilotLine) {
    lines.push(`<i>\u{1F9ED} ${p.autopilotLine}</i>`);
  }

  lines.push("<i>完整依据见 Web 工作站</i>");

  return lines.join("\n").trimEnd();
}

// ── Chat 纯文本（Web/TG 对话查询共用） ──

export function formatBriefingForChat(briefing: DailyBriefing, meta: BriefingRenderMeta = {}): string {
  const p = presentBriefing(briefing, meta.portfolio ?? null);
  const parts: string[] = [];

  if (p.mode === "digest") {
    parts.push("今日无需操作。");
    const watching: string[] = [];
    if (p.counts.surprises > 0) watching.push(`变化 ${p.counts.surprises} 条`);
    if (p.counts.dueForReview > 0) watching.push(`投资判断复核 ${p.counts.dueForReview} 个`);
    if (p.counts.riskAssets > 0) watching.push(`投资判断风险 ${p.counts.riskAssets} 项`);
    if (watching.length > 0) parts.push(`观察中：${watching.join(" · ")}`);
  } else {
    parts.push("📌 今日待办:");
    for (const a of p.actions) parts.push(`  • ${a.text}`);
  }

  if (p.surprises.length > 0) {
    parts.push("\n⚡ 需要复核的变化:");
    for (const s of p.surprises) parts.push(`  [${s.severityScore}/10] ${s.title}: ${formatBriefingTextExcerpt(s.description, 120)}`);
  }
  if (p.dueForReview.length > 0) {
    parts.push("\n🔍 投资判断复核:");
    for (const g of p.dueForReview) {
      parts.push(`  ${formatAssetLabelByKey(g.assetKey)} — ${g.uncertaintyReason}`);
      if (g.suggestedInvestigation) parts.push(`    ↳ ${formatBriefingTextExcerpt(g.suggestedInvestigation, 80)}`);
    }
  }
  if (p.mindChangeConditions.length > 0) {
    parts.push("\n🔄 改变判断的条件:");
    for (const m of p.mindChangeConditions) parts.push(`  「${m.thesisTitle}」(${m.currentConviction}): ${formatBriefingTextExcerpt(m.conditions.slice(0, 2).join("; "), 120)}`);
  }
  if (p.thesisRisks.length > 0) {
    parts.push("\n⚠️ 投资判断风险:");
    for (const g of p.thesisRisks) parts.push(...renderAssetRiskLine(g).map(l => `  ${l.replace(/^• /, "• ").trim()}`));
  }
  if (p.plan) {
    parts.push("\n🤖 目标权重计划:");
    if (p.plan.regimeOverride) parts.push(`  Regime: ${p.plan.regimeOverride.from} → ${p.plan.regimeOverride.to} (${p.plan.regimeOverride.confidence}%)`);
    if (p.plan.intents.length > 0) parts.push(`  ${p.plan.intents.map(i => `${i.label}→${i.targetPct.toFixed(1)}% (${i.confidence.toFixed(0)}%)`).join(", ")}`);
    if (p.plan.reasoning) parts.push(`  理由: ${p.plan.reasoning}`);
  }
  if (p.autopilotLine) {
    parts.push(`\n🧭 ${p.autopilotLine}`);
  }

  return parts.join("\n");
}
