import { clamp } from "./math";
import { normalizeWeights } from "./config";
import type { PriceBar, Strategy } from "./domain";

/**
 * Buy & Hold: always 100% in the asset.
 */
export function buyAndHold(): Strategy {
  return {
    id: "buy_and_hold",
    name: "Buy & Hold",
    weights: (series: PriceBar[]) => series.map(() => 1),
  };
}

/**
 * Simple moving average crossover (single-asset):
 * - weight=1 when fastSMA > slowSMA, else 0
 */
/**
 * Weighted ensemble of single-asset strategies.
 *
 * Combines multiple strategies' target weights into one final weight stream via
 * a normalized convex combination.
 *
 * @param {{
 *  id?: string,
 *  name?: string,
 *  strategies: Array<{id:string,name:string,weights:(series:any[])=>number[]}>,
 *  weightsById: Record<string, number>
 * }} args
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

export function smaCrossover({ fast = 5, slow = 20 }: { fast?: number; slow?: number } = {}): Strategy {
  if (fast >= slow) throw new Error("fast must be < slow");

  function sma(values: number[], i: number, window: number): number | null {
    if (i + 1 < window) return null;
    let sum = 0;
    for (let k = i - window + 1; k <= i; k++) sum += values[k];
    return sum / window;
  }

  return {
    id: `sma_${fast}_${slow}`,
    name: `SMA Crossover (${fast}/${slow})`,
    weights: (series: PriceBar[]) => {
      const closes = series.map((b) => b.close);
      return series.map((_b: PriceBar, i: number) => {
        const f = sma(closes, i, fast);
        const s = sma(closes, i, slow);
        if (f == null || s == null) return 0;
        return clamp(f > s ? 1 : 0, 0, 1);
      });
    },
  };
}
