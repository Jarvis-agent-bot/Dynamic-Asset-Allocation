import { clamp } from "./math.js";

/**
 * Buy & Hold: always 100% in the asset.
 */
export function buyAndHold() {
  return {
    id: "buy_and_hold",
    name: "Buy & Hold",
    weights: (series) => series.map(() => 1),
  };
}

/**
 * Simple moving average crossover (single-asset):
 * - weight=1 when fastSMA > slowSMA, else 0
 */
export function smaCrossover({ fast = 5, slow = 20 } = {}) {
  if (fast >= slow) throw new Error("fast must be < slow");

  function sma(values, i, window) {
    if (i + 1 < window) return null;
    let sum = 0;
    for (let k = i - window + 1; k <= i; k++) sum += values[k];
    return sum / window;
  }

  return {
    id: `sma_${fast}_${slow}`,
    name: `SMA Crossover (${fast}/${slow})`,
    weights: (series) => {
      const closes = series.map((b) => b.close);
      return series.map((_, i) => {
        const f = sma(closes, i, fast);
        const s = sma(closes, i, slow);
        if (f == null || s == null) return 0;
        return clamp(f > s ? 1 : 0, 0, 1);
      });
    },
  };
}
