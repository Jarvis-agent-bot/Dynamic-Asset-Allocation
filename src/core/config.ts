/**
 * Fixed-weight configuration (v0)
 *
 * Notes:
 * - Keep it simple and explicit.
 * - All weights are non-negative.
 * - They do NOT have to sum to 1; we will normalize at runtime.
 */

export const DEFAULT_ENSEMBLE_WEIGHTS: Record<string, number> = {
  buy_and_hold: 0.4,
  // Strategy id produced by smaCrossover({fast:5, slow:20})
  sma_5_20: 0.6,
};

/**
 * Throw if any weight is negative (DAA contract).
 *
 * We intentionally validate separately from normalizeWeights(), which still clamps
 * negatives for backward-compatibility / callers that want forgiving behavior.
 */
export function assertNonNegativeWeights(weights: Record<string, number> = {}): void {
  for (const [k, raw] of Object.entries(weights)) {
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`Weight for ${k} must be a finite number`);
    if (v < 0) throw new Error(`Weight for ${k} must be non-negative`);
  }
}

/** Normalize weights into a new object. */
export function normalizeWeights(weights: Record<string, number> = {}): Record<string, number> {
  const entries: Array<[string, number]> = Object.entries(weights).map(([k, raw]) => {
    const n = Number(raw);
    // Forgiving behavior: treat NaN/Infinity as 0, and clamp negatives to 0.
    const v = Number.isFinite(n) ? Math.max(0, n) : 0;
    return [k, v];
  });
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  if (sum <= 0) return Object.fromEntries(entries.map(([k]) => [k, 0]));
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}
