import type { AgentConfigOverlay, AutopilotCoverageSummary } from "@/src/daa/agent/cognitiveTypes";
import type { PortfolioSnapshot, WatchlistSnapshot } from "@/src/daa/agent/cognitiveState";

function isPastCooldown(input: { lastEntryTriggeredAt: string | null; entryCooldownDays: number }): boolean {
  if (!input.lastEntryTriggeredAt) return true;
  const lastMs = Date.parse(input.lastEntryTriggeredAt);
  if (!Number.isFinite(lastMs)) return true;
  const cooldownMs = Math.max(1, input.entryCooldownDays) * 24 * 60 * 60 * 1000;
  return Date.now() - lastMs >= cooldownMs;
}

function summarizeReasons(reasons: string[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export function buildAutopilotCoverageSummary(input: {
  portfolio: PortfolioSnapshot;
  watchlist: WatchlistSnapshot | null;
  overlay: AgentConfigOverlay | null | undefined;
}): AutopilotCoverageSummary {
  const candidates = input.watchlist?.candidates ?? [];
  const watchlistSkips: AutopilotCoverageSummary["watchlistSkips"] = [];
  for (const candidate of candidates) {
    const reasons: string[] = [];
    if (!candidate.autoEntryEnabled) reasons.push("未开启规则自动建仓");
    if (!(candidate.entryTargetWeightPct != null && candidate.entryTargetWeightPct > 0) && !(candidate.targetWeightPct > 0)) {
      reasons.push("未设置规则目标权重");
    }
    if (!isPastCooldown(candidate)) reasons.push(`冷静期未过（${candidate.entryCooldownDays}天）`);
    if (!(candidate.lastPrice > 0) || candidate.fxMissing) reasons.push("缺少价格或汇率");
    if (reasons.length > 0) {
      watchlistSkips.push({
        assetKey: candidate.assetKey,
        symbol: candidate.symbol,
        reasons,
      });
    }
  }

  const planIntents = input.overlay?.targetAllocationPlan?.intents ?? [];
  const acceptedPlanIntents = planIntents.filter(intent => Number(intent.confidence) >= 70);
  return {
    holdingAssets: input.portfolio.holdings.length,
    watchlistCandidates: candidates.length,
    ruleAutoEntryEnabled: candidates.filter(candidate => candidate.autoEntryEnabled).length,
    watchlistWithRuleTarget: candidates.filter(candidate => (
      (candidate.entryTargetWeightPct != null && candidate.entryTargetWeightPct > 0) || candidate.targetWeightPct > 0
    )).length,
    brainPlanIntents: planIntents.length,
    acceptedBrainPlanIntents: acceptedPlanIntents.length,
    watchlistSkips: watchlistSkips.slice(0, 8),
    skipReasonSummary: summarizeReasons(watchlistSkips.flatMap(item => item.reasons)),
  };
}
