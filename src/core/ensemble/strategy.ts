import { clamp } from "../math";
import { assertNonNegativeWeights, normalizeWeights } from "../config";
import type { PriceBar, Strategy } from "../domain";

/**
 * Weighted ensemble of single-asset strategies.
 *
 * Combines multiple strategies' target weights into one final weight stream via
 * a normalized convex combination.
 */
export function ensembleStrategy({
  id = "ensemble",
  name = "Ensemble",
  strategies,
  weightsById,
}: {
  id?: string;
  name?: string;
  strategies: Strategy[];
  weightsById: Record<string, number>;
}): Strategy {
  if (!Array.isArray(strategies) || strategies.length === 0) {
    throw new Error("strategies required");
  }

  // DAA contract: never accept negative weights.
  assertNonNegativeWeights(weightsById);

  // Contract: strategy ids must be unique. Duplicate ids would cause ambiguous normalization.
  const ids = strategies.map((s) => s.id);
  const uniq = new Set(ids);
  if (uniq.size !== strategies.length) {
    const counts = ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const dups = Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([id]) => id)
      .join(", ");
    throw new Error(`Strategy ids must be unique (duplicates: ${dups || "unknown"})`);
  }

  // Contract: weightsById must not contain unknown non-zero strategy ids.
  const unknown = Object.entries(weightsById).filter(([id, raw]) => !uniq.has(id) && Number(raw) !== 0);
  if (unknown.length > 0) {
    throw new Error(`Unknown strategy id(s) in weightsById: ${unknown.map(([id]) => id).join(", ")}`);
  }

  // Contract: at least one included strategy must have a positive weight.
  const sumIncluded = strategies.reduce((acc, s) => acc + (Number(weightsById[s.id] ?? 0) || 0), 0);
  if (sumIncluded <= 0) {
    throw new Error("weightsById must assign a positive weight to at least one strategy in the ensemble");
  }

  // Normalize only across the strategies that are part of this ensemble.
  const weightsForStrats = Object.fromEntries(strategies.map((s) => [s.id, Number(weightsById[s.id] ?? 0)]));
  const norm = normalizeWeights(weightsForStrats);

  return {
    id,
    name,
    weights: (series: PriceBar[]) => {
      if (series.length === 0) {
        throw new Error("ensembleStrategy.weights() requires a non-empty price series");
      }

      const parts: number[][] = strategies.map((s) => {
        const w = s.weights(series);
        if (w.length !== series.length) {
          throw new Error(`weights length mismatch: ${s.id} expected=${series.length} got=${w.length}`);
        }

        // Contract: strategy weights must be finite numbers in [0, 1].
        // We keep this strict (instead of silently clamping) to avoid hiding provider/strategy bugs
        // that can degrade signal quality.
        for (let i = 0; i < w.length; i++) {
          const v = Number(w[i]);
          if (!Number.isFinite(v)) throw new Error(`Non-finite weight from ${s.id} at index ${i}: ${String(w[i])}`);
          if (v < 0 || v > 1) {
            throw new Error(`Out-of-range weight from ${s.id} at index ${i}: ${String(w[i])} (expected 0..1)`);
          }
        }

        return w.map((x: number) => clamp(Number(x), 0, 1));
      });

      return series.map((_b: PriceBar, i: number) => {
        let acc = 0;
        for (let si = 0; si < strategies.length; si++) {
          const sid = strategies[si].id;
          const alpha = Number(norm[sid] || 0);
          acc += alpha * parts[si][i];
        }
        return clamp(acc, 0, 1);
      });
    },
  };
}
