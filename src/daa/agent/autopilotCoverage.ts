import type { AgentStrategyOverlay, AutopilotCoverageSummary } from "@/src/daa/agent/cognitiveTypes";
import type { PortfolioSnapshot, WatchlistSnapshot } from "@/src/daa/agent/cognitiveState";

export function buildAutopilotCoverageSummary(input: {
  portfolio: PortfolioSnapshot;
  watchlist: WatchlistSnapshot | null;
  overlay: AgentStrategyOverlay | null | undefined;
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
  const targetedCandidates = candidates.filter((candidate) => candidate.targetWeightPct > 0);
  return {
    holdingAssets: input.portfolio.holdings.length,
    watchlistCandidates: candidates.length,
    watchlistTargetedAssets: targetedCandidates.length,
    brainPlanIntents: planIntents.length,
    acceptedBrainPlanIntents: acceptedPlanIntents.length,
  };
}
