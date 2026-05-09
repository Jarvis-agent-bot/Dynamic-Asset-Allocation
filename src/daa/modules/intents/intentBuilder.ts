import type { RebalanceTriggerSource } from "@/src/daa/modules/workbench/workbenchTypes";
import type { CashSignal, DriftSignal, PortfolioSignal, RiskSignal } from "@/src/daa/modules/signals/signalTypes";

import type { InvestmentIntent } from "./intentTypes";

function intentExpiry(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function buildInvestmentIntents(input: {
  triggerSource: RebalanceTriggerSource;
  triggerReason: string;
  signals: PortfolioSignal[];
  manual: boolean;
  hasAgentTargetOverrides?: boolean;
}): InvestmentIntent[] {
  const out: InvestmentIntent[] = [];
  const now = new Date().toISOString();
  const driftSignals = input.signals.filter(
    (signal): signal is DriftSignal => signal.type === "drift" && signal.enteredOuterBand,
  );
  const riskSignals = input.signals.filter(
    (signal): signal is RiskSignal => signal.type === "risk" && signal.severity === "critical",
  );
  const cashSignals = input.signals.filter(
    (signal): signal is CashSignal => signal.type === "cash",
  );

  if (input.manual) {
    out.push({
      intentId: `intent:manual:${now}`,
      source: "manual",
      action: "review_only",
      assetKeys: [],
      thesis: input.triggerReason || "人工生成调仓建议",
      confidencePct: 100,
      expiresAt: null,
      evidenceRefs: input.signals.slice(0, 12).map((signal) => signal.signalId),
    });
  }

  if (input.triggerSource === "scheduled_review") {
    out.push({
      intentId: `intent:scheduled_review:${now}`,
      source: "scheduled_review",
      action: "review_only",
      assetKeys: [],
      thesis: "定期组合复盘窗口到达，重新评估是否需要行动。",
      confidencePct: 65,
      expiresAt: intentExpiry(24),
      evidenceRefs: input.signals.slice(0, 12).map((signal) => signal.signalId),
    });
  }

  if (driftSignals.length > 0) {
    out.push({
      intentId: `intent:drift:${now}`,
      source: "drift",
      action: "hold",
      assetKeys: driftSignals.map((signal) => signal.assetKey),
      thesis: `组合偏离进入行动外圈: ${driftSignals.slice(0, 5).map((signal) => `${signal.symbol} ${signal.absDriftPct.toFixed(1)}%`).join(", ")}`,
      confidencePct: 70,
      expiresAt: intentExpiry(24),
      evidenceRefs: driftSignals.map((signal) => signal.signalId),
    });
  }

  if (riskSignals.length > 0) {
    out.push({
      intentId: `intent:risk:${now}`,
      source: "risk_reduction",
      action: "risk_reduce",
      assetKeys: riskSignals.map((signal) => signal.assetKey),
      thesis: `风险信号要求降风险: ${riskSignals.map((signal) => signal.symbol).join(", ")}`,
      confidencePct: 90,
      expiresAt: intentExpiry(6),
      evidenceRefs: riskSignals.map((signal) => signal.signalId),
    });
  }

  if (cashSignals.length > 0) {
    out.push({
      intentId: `intent:cash:${now}`,
      source: "cash_deploy",
      action: "increase",
      assetKeys: [],
      thesis: cashSignals[0]?.evidence[0] || "现金占比超过闲置阈值",
      confidencePct: 55,
      expiresAt: intentExpiry(72),
      evidenceRefs: cashSignals.map((signal) => signal.signalId),
    });
  }

  if (input.triggerSource === "agent_trigger" || input.hasAgentTargetOverrides) {
    out.push({
      intentId: `intent:agent:${now}`,
      source: "agent_thesis",
      action: "review_only",
      assetKeys: [],
      thesis: input.triggerReason || "Agent 目标权重计划进入策略评估。",
      confidencePct: 80,
      expiresAt: intentExpiry(24),
      evidenceRefs: input.signals.slice(0, 12).map((signal) => signal.signalId),
    });
  }

  return out;
}
