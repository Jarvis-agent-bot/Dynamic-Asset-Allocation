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

  const norm = normalizeWeights(weightsById);

  return {
    id,
    name,
    weights: (series: PriceBar[]) => {
      const parts: number[][] = strategies.map((s) => {
        const w = s.weights(series);
        if (w.length !== series.length) throw new Error(`weights length mismatch: ${s.id}`);
        return w.map((x: number) => clamp(Number(x) || 0, 0, 1));
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
