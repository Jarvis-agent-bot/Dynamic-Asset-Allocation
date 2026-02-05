import { clamp } from "./math";
import type { Action, SignalThresholds } from "./domain";
import { assertValidSignalThresholds } from "./signalThresholds";

export function decideAction(prevWeight: number, targetWeight: number, thresholds: SignalThresholds): Action {
  return decideActionWithReason(prevWeight, targetWeight, thresholds).action;
}

/**
 * Like decideAction(), but also returns the rule that fired.
 *
 * This improves signal explainability without changing the core Action API.
 */
export function decideActionWithReason(
  prevWeight: number,
  targetWeight: number,
  thresholds: SignalThresholds
): { action: Action; reason: string } {
  assertValidSignalThresholds(thresholds);

  const prev = clamp(prevWeight ?? 0, 0, 1);
  const tw = clamp(targetWeight ?? 0, 0, 1);
  const delta = tw - prev;

  const { buyAbove, sellBelow, minChange } = thresholds;

  const crossedBuy = prev <= buyAbove && tw > buyAbove;
  const crossedSell = prev >= sellBelow && tw < sellBelow;

  if (crossedBuy) return { action: "BUY", reason: `rule: crossed above buyAbove (${buyAbove})` };
  if (crossedSell) return { action: "SELL", reason: `rule: crossed below sellBelow (${sellBelow})` };
  if (delta >= minChange) return { action: "BUY", reason: `rule: Δ>=minChange (${minChange})` };
  if (delta <= -minChange) return { action: "SELL", reason: `rule: Δ<=-minChange (${minChange})` };

  return { action: "HOLD", reason: `rule: within band & |Δ|<minChange (${minChange})` };
}

export function computeConfidence(action: Action, prevWeight: number, targetWeight: number, thresholds: SignalThresholds): number {
  assertValidSignalThresholds(thresholds);

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
