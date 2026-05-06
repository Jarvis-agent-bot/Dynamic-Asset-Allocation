import type { AgentConfigOverlay, AutopilotCoverageSummary } from "@/src/daa/agent/cognitiveTypes";
import type { PortfolioSnapshot, WatchlistSnapshot } from "@/src/daa/agent/cognitiveState";

function isCooldownReady(lastEntryTriggeredAt: string | null, entryCooldownDays: number): boolean {
  if (!lastEntryTriggeredAt) return true;
  const lastMs = Date.parse(lastEntryTriggeredAt);
  if (!Number.isFinite(lastMs)) return true;
  const cooldownMs = Math.max(1, Number(entryCooldownDays) || 0) * 24 * 60 * 60 * 1000;
  return Date.now() - lastMs >= cooldownMs;
}

function getEffectiveWatchlistTargetWeightPct(candidate: WatchlistSnapshot["candidates"][number]): number | null {
  if (candidate.entryTargetWeightPct != null && candidate.entryTargetWeightPct > 0) {
    return candidate.entryTargetWeightPct;
  }
  return candidate.targetWeightPct > 0 ? candidate.targetWeightPct : null;
}

export function buildAutopilotCoverageSummary(input: {
  portfolio: PortfolioSnapshot;
  watchlist: WatchlistSnapshot | null;
  overlay: AgentConfigOverlay | null | undefined;
}): AutopilotCoverageSummary {
  const candidates = input.watchlist?.candidates ?? [];
  const knownAssetKeys = new Set([
    ...input.portfolio.holdings.map((holding) => holding.assetKey.toUpperCase()),
    ...candidates.map((candidate) => candidate.assetKey.toUpperCase()),
  ]);
  const planIntents = input.overlay?.targetAllocationPlan?.intents ?? [];
  const acceptedPlanIntents = planIntents.filter(intent => (
    Number(intent.confidence) >= 70
    && knownAssetKeys.has(String(intent.assetKey || "").trim().toUpperCase())
  ));
  const targetedCandidates = candidates.filter((candidate) => {
    const targetWeightPct = getEffectiveWatchlistTargetWeightPct(candidate);
    return targetWeightPct != null && targetWeightPct > 0;
  });
  const autoEntryReadyAssets = candidates.filter((candidate) => {
    const targetWeightPct = getEffectiveWatchlistTargetWeightPct(candidate);
    return candidate.autoEntryEnabled
      && targetWeightPct != null
      && targetWeightPct > 0
      && candidate.lastPrice > 0
      && !candidate.fxMissing
      && isCooldownReady(candidate.lastEntryTriggeredAt, candidate.entryCooldownDays);
  }).length;
  return {
    holdingAssets: input.portfolio.holdings.length,
    watchlistCandidates: candidates.length,
    watchlistTargetedAssets: targetedCandidates.length,
    autoEntryReadyAssets,
    brainPlanIntents: planIntents.length,
    acceptedBrainPlanIntents: acceptedPlanIntents.length,
  };
}
