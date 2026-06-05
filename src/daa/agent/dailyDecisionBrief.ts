export type DailyDecisionPosture = "hold" | "approve_required" | "investigating" | "risk_watch";

export type DailyDecisionQueueSummary = {
  decisionCount: number;
  confirmCount: number;
  investigateCount: number;
  monitorCount: number;
  diagnosticsCount: number;
};

export type StrategyOverlayIntent = {
  assetKey: string;
  symbol?: string | null;
  proposedTargetWeightPct: number;
  confidence: number;
  reasoning: string;
};

export type StrategyOverlay = {
  generatedAt: string;
  agentRunId: string;
  regimeOverride?: unknown;
  targetAllocationPlan?: {
    reasoning: string;
    intents: StrategyOverlayIntent[];
  } | null;
} | null;

export type DailyApprovalItem = {
  key: string;
  title: string;
  reason: string;
  confidencePct: number | null;
  intent: StrategyOverlayIntent;
};

export type DailyDecisionBriefInput = {
  queue: DailyDecisionQueueSummary;
  backgroundCount: number;
  strategyOverlay: StrategyOverlay;
};

export type DailyDecisionBrief = {
  posture: DailyDecisionPosture;
  label: string;
  title: string;
  description: string;
  approvals: DailyApprovalItem[];
  metrics: {
    approvalCount: number;
    backgroundCount: number;
    investigationCount: number;
    diagnosticsCount: number;
  };
};

export type DailyDecisionBriefingInput = {
  surprises?: Array<{ severityScore?: unknown }> | null;
  cognitionGaps?: Array<{ portfolioWeight?: unknown }> | null;
  thesisFailureImpacts?: Array<{ riskLevel?: unknown }> | null;
  thesisConflicts?: unknown[] | null;
  strategyOverlay?: StrategyOverlay;
};

function normalizeSymbol(intent: StrategyOverlayIntent): string {
  const symbol = String(intent.symbol || "").trim();
  if (symbol) return symbol.toUpperCase();
  const assetKey = String(intent.assetKey || "").trim();
  const fallback = assetKey.includes("::") ? assetKey.split("::").pop() : assetKey;
  return String(fallback || "资产").toUpperCase();
}

function buildApprovals(overlay: StrategyOverlay): DailyApprovalItem[] {
  const intents = overlay?.targetAllocationPlan?.intents ?? [];
  return intents
    .filter((intent) => Number.isFinite(Number(intent.proposedTargetWeightPct)))
    .slice(0, 12)
    .map((intent, index) => {
      const symbol = normalizeSymbol(intent);
      const target = Number(intent.proposedTargetWeightPct);
      return {
        key: `target-${intent.assetKey || symbol}-${index}`,
        title: `${symbol} 目标 ${target.toFixed(2)}%`,
        reason: String(intent.reasoning || overlay?.targetAllocationPlan?.reasoning || "Agent 建议调整目标权重。").trim(),
        confidencePct: Number.isFinite(Number(intent.confidence)) ? Math.max(0, Math.min(100, Number(intent.confidence))) : null,
        intent,
      };
    });
}

export function buildDailyDecisionBrief(input: DailyDecisionBriefInput): DailyDecisionBrief {
  const approvals = buildApprovals(input.strategyOverlay);
  const backgroundCount = Math.max(0, input.backgroundCount);
  const investigationCount = Math.max(0, input.queue.investigateCount);
  const diagnosticsCount = Math.max(0, input.queue.diagnosticsCount + input.queue.decisionCount + input.queue.confirmCount);

  if (approvals.length > 0) {
    return {
      posture: "approve_required",
      label: "等待批准",
      title: "今天建议调整仓位，等待你批准",
      description: input.strategyOverlay?.targetAllocationPlan?.reasoning
        || `${approvals.length} 个目标权重变化需要你确认后再进入执行链路。`,
      approvals,
      metrics: {
        approvalCount: approvals.length,
        backgroundCount,
        investigationCount,
        diagnosticsCount,
      },
    };
  }

  if (input.queue.confirmCount > 0 || input.queue.decisionCount > 0) {
    return {
      posture: "risk_watch",
      label: "风险观察",
      title: "今天不建议直接交易，但有风险需要观察",
      description: "Agent 没有形成明确的目标权重变化；相关风险先进入后台跟踪，不作为你的拍板待办。",
      approvals,
      metrics: {
        approvalCount: 0,
        backgroundCount,
        investigationCount,
        diagnosticsCount,
      },
    };
  }

  if (investigationCount > 0) {
    return {
      posture: "investigating",
      label: "补充调查",
      title: "今天不建议直接交易，Agent 正在补证据",
      description: `${investigationCount} 条判断需要后台调查；它们不是你的主待办，除非你想要求深查。`,
      approvals,
      metrics: {
        approvalCount: 0,
        backgroundCount,
        investigationCount,
        diagnosticsCount,
      },
    };
  }

  return {
    posture: "hold",
    label: "保持当前",
    title: "今天不建议交易",
    description: "Agent 没有形成目标权重变化，也没有需要你亲自处理的组合动作。",
    approvals,
    metrics: {
      approvalCount: 0,
      backgroundCount,
      investigationCount,
      diagnosticsCount,
    },
  };
}

export function buildDailyDecisionBriefFromBriefing(briefing: DailyDecisionBriefingInput | null | undefined): DailyDecisionBrief | null {
  if (!briefing) return null;

  const surprises = Array.isArray(briefing.surprises) ? briefing.surprises : [];
  const gaps = Array.isArray(briefing.cognitionGaps) ? briefing.cognitionGaps : [];
  const risks = Array.isArray(briefing.thesisFailureImpacts) ? briefing.thesisFailureImpacts : [];
  const conflicts = Array.isArray(briefing.thesisConflicts) ? briefing.thesisConflicts : [];

  const queue: DailyDecisionQueueSummary = {
    decisionCount: 0,
    confirmCount: 0,
    investigateCount: 0,
    monitorCount: 0,
    diagnosticsCount: conflicts.length,
  };

  for (const surprise of surprises) {
    const severity = Number(surprise.severityScore);
    if (severity >= 8) queue.decisionCount += 1;
    else if (severity >= 5) queue.confirmCount += 1;
    else queue.monitorCount += 1;
  }

  for (const gap of gaps) {
    const weight = Number(gap.portfolioWeight);
    if (Number.isFinite(weight) && weight >= 0.05) queue.investigateCount += 1;
    else queue.monitorCount += 1;
  }

  for (const risk of risks) {
    const riskLevel = String(risk.riskLevel || "").trim();
    if (riskLevel === "low") continue;
    if (riskLevel === "critical" || riskLevel === "high") queue.decisionCount += 1;
    else queue.confirmCount += 1;
  }

  return buildDailyDecisionBrief({
    queue,
    backgroundCount: surprises.length + gaps.length + risks.length + conflicts.length,
    strategyOverlay: briefing.strategyOverlay ?? null,
  });
}
