import { clamp } from "./math";
import type { Action, SignalThresholds } from "./domain";

export function decideAction(prevWeight: number, targetWeight: number, thresholds: SignalThresholds): Action {
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
  const prev = clamp(prevWeight ?? 0, 0, 1);
  const tw = clamp(targetWeight ?? 0, 0, 1);
  const delta = tw - prev;

  const { buyAbove, sellBelow } = thresholds;

  const dist = action === "BUY" ? Math.max(0, tw - buyAbove) : action === "SELL" ? Math.max(0, sellBelow - tw) : 0;
  return clamp(0.4 + dist * 1.5 + Math.min(0.3, Math.abs(delta)), 0, 1);
}
