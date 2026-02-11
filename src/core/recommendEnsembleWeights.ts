import type { RankedBacktestResult } from "./backtest";

/**
 * Recommend a fixed-weight `weightsConfig` (v0) from ranked backtest results.
 *
 * Contract:
 * - strategy ids must be unique
 * - weights are non-negative
 * - result does NOT have to sum to 1 (callers may normalize)
 *
 * Behavior (v0):
 * - Shift scores up if needed to avoid negative weights
 * - If all weights are 0, fall back to equal weights
 */
export function recommendEnsembleWeightsFromRankedResults(
  ranked: RankedBacktestResult[] = []
): Record<string, number> {
  if (!ranked.length) return {};

  const ids = ranked.map((r) => String(r.strategyId));
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) {
    throw new Error("recommendEnsembleWeightsFromRankedResults(): strategy ids must be unique");
  }

  const scores = ranked.map((r) => {
    const n = Number((r as any)?.score);
    return Number.isFinite(n) ? n : 0;
  });

  const minScore = scores.reduce((acc, s) => Math.min(acc, s), Number.POSITIVE_INFINITY);
  const shift = minScore < 0 ? -minScore : 0;

  const weights = Object.fromEntries(
    ranked.map((r, i) => {
      const w = Math.max(0, scores[i] + shift);
      return [String(r.strategyId), w];
    })
  );

  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0);
  if (sum > 0) return weights;

  // Degenerate case: all strategies scored 0 (or everything was non-finite).
  // Keep it simple and assign equal positive weights.
  return Object.fromEntries(ids.map((id) => [id, 1]));
}
