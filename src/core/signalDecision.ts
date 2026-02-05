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

  // Defensive: treat non-finite inputs as invalid and HOLD.
  // Data providers / pipelines can occasionally emit NaN/Infinity; we don't want that
  // to accidentally trigger BUY/SELL actions.
  const prevNum = Number(prevWeight);
  const twNum = Number(targetWeight);
  if (!Number.isFinite(prevNum) || !Number.isFinite(twNum)) {
    return { action: "HOLD", reason: "rule: invalid (non-finite) weight input" };
  }

  const prev = clamp(prevNum, 0, 1);
  const tw = clamp(twNum, 0, 1);
  const delta = tw - prev;

  const { buyAbove, sellBelow, minChange } = thresholds;

  const crossedBuy = prev <= buyAbove && tw > buyAbove;
  const crossedSell = prev >= sellBelow && tw < sellBelow;

  const fmt = (x: number) => Number.isFinite(x) ? x.toFixed(3) : String(x);

  if (crossedBuy) {
    return {
      action: "BUY",
      reason: `rule: crossed above buyAbove (${fmt(buyAbove)}): prev=${fmt(prev)} -> tw=${fmt(tw)}`,
    };
  }

  if (crossedSell) {
    return {
      action: "SELL",
      reason: `rule: crossed below sellBelow (${fmt(sellBelow)}): prev=${fmt(prev)} -> tw=${fmt(tw)}`,
    };
  }

  if (delta >= minChange) return { action: "BUY", reason: `rule: Δ=${fmt(delta)}>=minChange (${fmt(minChange)})` };
  if (delta <= -minChange) return { action: "SELL", reason: `rule: Δ=${fmt(delta)}<=-minChange (${fmt(minChange)})` };

  return {
    action: "HOLD",
    reason: `rule: within band [${fmt(sellBelow)}, ${fmt(buyAbove)}] & |Δ|<minChange (${fmt(minChange)})`,
  };
}

export function computeConfidence(
  action: Action,
  prevWeight: number,
  targetWeight: number,
  thresholds: SignalThresholds
): number {
  assertValidSignalThresholds(thresholds);

  // Defensive: if inputs are invalid, confidence should be 0.
  const prevNum = Number(prevWeight);
  const twNum = Number(targetWeight);
  if (!Number.isFinite(prevNum) || !Number.isFinite(twNum)) return 0;

  const prev = clamp(prevNum, 0, 1);
  const tw = clamp(twNum, 0, 1);
  const delta = tw - prev;

  const { buyAbove, sellBelow, minChange } = thresholds;

  const bandWidth = buyAbove - sellBelow; // >0 by contract

  // How far beyond the neutral band are we? (drives BUY/SELL confidence)
  const bandDist =
    action === "BUY" ? Math.max(0, tw - buyAbove) : action === "SELL" ? Math.max(0, sellBelow - tw) : 0;

  // How much does momentum exceed the minChange threshold?
  const momExcess = Math.max(0, Math.abs(delta) - (minChange || 0));

  if (action === "HOLD") {
    // HOLD confidence should be higher when:
    // - we're safely inside the band
    // - day-over-day change is small (not near a momentum trigger)
    const insideBand = tw >= sellBelow && tw <= buyAbove;
    const margin = insideBand ? Math.min(tw - sellBelow, buyAbove - tw) : 0;
    const marginNorm = clamp(bandWidth > 0 ? margin / (bandWidth / 2) : 0, 0, 1); // 1 in the middle

    const deltaNorm = minChange > 0 ? clamp(1 - Math.abs(delta) / minChange, 0, 1) : 1;

    return clamp(0.2 + 0.45 * marginNorm + 0.25 * deltaNorm, 0, 1);
  }

  // BUY/SELL confidence increases when we are meaningfully beyond the band OR when momentum strongly exceeds minChange.
  return clamp(0.4 + bandDist * 1.5 + Math.min(0.3, Math.abs(delta)) + momExcess * 0.5, 0, 1);
}
