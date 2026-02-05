import { clamp } from "./math";
import type { Action, SignalThresholds } from "./domain";

function assertValidThresholds(thresholds: SignalThresholds): void {
  const { buyAbove, sellBelow, minChange } = thresholds;

  for (const [k, v] of Object.entries({ buyAbove, sellBelow, minChange })) {
    if (!Number.isFinite(v)) throw new Error(`Signal threshold ${k} must be a finite number`);
  }

  if (buyAbove < 0 || buyAbove > 1) throw new Error(`Signal threshold buyAbove must be within [0,1]`);
  if (sellBelow < 0 || sellBelow > 1) throw new Error(`Signal threshold sellBelow must be within [0,1]`);
  if (minChange < 0 || minChange > 1) throw new Error(`Signal threshold minChange must be within [0,1]`);

  // Contract: the neutral band is [sellBelow, buyAbove].
  if (sellBelow > buyAbove) throw new Error(`Signal threshold sellBelow must be <= buyAbove`);
}

export function decideAction(prevWeight: number, targetWeight: number, thresholds: SignalThresholds): Action {
  assertValidThresholds(thresholds);

  const prev = clamp(prevWeight ?? 0, 0, 1);
  const tw = clamp(targetWeight ?? 0, 0, 1);
  const delta = tw - prev;

  const { buyAbove, sellBelow, minChange } = thresholds;

  const crossedBuy = prev <= buyAbove && tw > buyAbove;
  const crossedSell = prev >= sellBelow && tw < sellBelow;

  if (crossedBuy || delta >= minChange) return "BUY";
  if (crossedSell || delta <= -minChange) return "SELL";
  return "HOLD";
}

export function computeConfidence(action: Action, prevWeight: number, targetWeight: number, thresholds: SignalThresholds): number {
  assertValidThresholds(thresholds);

  const prev = clamp(prevWeight ?? 0, 0, 1);
  const tw = clamp(targetWeight ?? 0, 0, 1);
  const delta = tw - prev;

  const { buyAbove, sellBelow } = thresholds;

  // Intuition: BUY/SELL decisions can be high-confidence when we are meaningfully beyond the band.
  // HOLD is inherently lower-confidence; otherwise flat/quiet series tend to look "confident" by default.
  const dist = action === "BUY" ? Math.max(0, tw - buyAbove) : action === "SELL" ? Math.max(0, sellBelow - tw) : 0;

  if (action === "HOLD") {
    return clamp(0.2 + Math.min(0.2, Math.abs(delta)) * 0.5, 0, 1);
  }

  return clamp(0.4 + dist * 1.5 + Math.min(0.3, Math.abs(delta)), 0, 1);
}
