import { formatAssetLabel } from "@/src/daa/assetRegistry";
import type { AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { RebalanceTriggerSource, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

export type AutoExecuteBreachProposal = {
  assetKey?: string | null;
  symbol?: string | null;
  suggestedNotional?: number | null;
};

export function buildEmptyAutoTriggerSkipMessage(input: {
  triggerSource: RebalanceTriggerSource;
  manual: boolean;
  proposalCount: number;
  agentSummary?: string | null;
}): string | null {
  if (input.manual || input.proposalCount > 0) return null;

  const summary = input.agentSummary ? `（${input.agentSummary}）` : "";
  if (input.triggerSource === "agent_trigger") {
    return `Agent 主动调仓未生成可执行提案，跳过创建周期${summary}。`;
  }
  if (input.triggerSource === "calendar") {
    return `定期再平衡未生成可执行提案，跳过创建周期${summary}。`;
  }
  if (input.triggerSource === "drift") {
    return `偏移检查未生成可执行提案，跳过创建周期${summary}。`;
  }
  return `自动触发未生成可执行提案，跳过创建周期${summary}。`;
}

export function findAutoExecuteSingleOrderBreach(input: {
  totalEquity: number;
  maxSinglePct: number;
  proposals: AutoExecuteBreachProposal[];
}): (AutoExecuteBreachProposal & { message: string }) | null {
  const totalEquity = Math.max(0, Number(input.totalEquity) || 0);
  const maxSinglePct = Math.max(0, Number(input.maxSinglePct) || 0);
  if (!(totalEquity > 0) || !(maxSinglePct > 0)) return null;

  const proposal = input.proposals.find((row) => {
    const notional = Math.max(0, Number(row.suggestedNotional) || 0);
    return notional / totalEquity > maxSinglePct;
  });
  if (!proposal) return null;

  const label = formatAssetLabel({ symbol: proposal.symbol || undefined, assetKey: proposal.assetKey || undefined });
  const notional = Math.max(0, Number(proposal.suggestedNotional) || 0);
  return {
    ...proposal,
    message: `[autoExecuteMaxSinglePct 守门] ${label} 单笔 $${notional.toFixed(0)} 超过 NAV 的 ${(maxSinglePct * 100).toFixed(1)}% 上限，已阻止自动执行`,
  };
}

export function shouldSendAgentBriefingTelegram(config: DaaSystemConfig): boolean {
  return config.notification.telegram.enabled === true
    && config.notification.telegram.dailyReport === true;
}

export type AgentTargetWeightOverrides = {
  targetWeightOverrides: Record<string, number>;
  acceptedCount: number;
  skippedCount: number;
  reason: string;
  summary: string;
};

export function buildAgentTargetWeightOverrides(input: {
  overlay: AgentConfigOverlay | null;
  knownAssetKeys: string[];
  maxPositionPct: number;
  minConfidence?: number;
}): AgentTargetWeightOverrides | null {
  const plan = input.overlay?.targetAllocationPlan;
  const intents = Array.isArray(plan?.intents) ? plan.intents : [];
  if (intents.length === 0) return null;

  const known = new Map<string, string>();
  for (const key of input.knownAssetKeys) {
    const canonical = String(key || "").trim();
    if (!canonical) continue;
    known.set(canonical.toUpperCase(), canonical);
    known.set(canonical.toUpperCase().replace("::", ":"), canonical);
  }
  const maxPositionPct = Math.max(0, Number(input.maxPositionPct) || 0);
  const minConfidence = Math.max(0, Number(input.minConfidence ?? 70) || 0);
  const targetWeightOverrides: Record<string, number> = {};
  const acceptedLabels: string[] = [];
  let skippedCount = 0;

  for (const intent of intents) {
    const assetKey = String(intent.assetKey || "").trim();
    const symbol = String(intent.symbol || assetKey).trim();
    const proposedPct = Number(intent.proposedTargetWeightPct);
    const confidence = Number(intent.confidence);
    const canonicalAssetKey = known.get(assetKey.toUpperCase());
    if (!assetKey || !canonicalAssetKey) {
      skippedCount += 1;
      continue;
    }
    if (!Number.isFinite(proposedPct) || proposedPct < 0 || !Number.isFinite(confidence) || confidence < minConfidence) {
      skippedCount += 1;
      continue;
    }

    const targetPct = Math.min(proposedPct / 100, maxPositionPct > 0 ? maxPositionPct : proposedPct / 100);
    targetWeightOverrides[canonicalAssetKey] = Number(Math.max(0, targetPct).toFixed(6));
    acceptedLabels.push(`${symbol || canonicalAssetKey}→${(targetWeightOverrides[canonicalAssetKey] * 100).toFixed(1)}%`);
  }

  if (acceptedLabels.length === 0) return null;
  const summary = String(plan?.reasoning || "Agent 目标权重计划").trim() || "Agent 目标权重计划";
  return {
    targetWeightOverrides,
    acceptedCount: acceptedLabels.length,
    skippedCount,
    reason: acceptedLabels.join(", "),
    summary,
  };
}

export function applyTargetWeightOverridesToBootstrap(
  bootstrap: WorkbenchBootstrap,
  targetWeightOverrides: Record<string, number> | null | undefined,
): WorkbenchBootstrap {
  const entries = Object.entries(targetWeightOverrides || {})
    .map(([assetKey, value]) => [assetKey.toUpperCase(), Math.max(0, Number(value) || 0)] as const)
    .filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) return bootstrap;

  const byAssetKey = new Map(entries);
  return {
    ...bootstrap,
    assetUniverse: bootstrap.assetUniverse.map((row) => {
      const targetWeight = byAssetKey.get(row.assetKey.toUpperCase());
      if (targetWeight == null) return row;
      const targetWeightPct = Number((targetWeight * 100).toFixed(6));
      const actualWeightPct = Math.max(0, Number(row.actualWeightPct) || 0);
      return {
        ...row,
        targetWeightPct,
        targetWeightHint: targetWeight,
        gapPct: Number((targetWeightPct - actualWeightPct).toFixed(6)),
      };
    }),
  };
}
