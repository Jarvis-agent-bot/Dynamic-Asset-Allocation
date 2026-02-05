import { clamp } from "./math";
import type { PriceBar, Strategy } from "./domain";
import { ensembleStrategy } from "./ensemble";

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

// Re-exported from ./ensemble for convenience.
export { ensembleStrategy };

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
