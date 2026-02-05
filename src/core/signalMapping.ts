import { clamp } from "./math";
import type { Action, Signal, SignalThresholds } from "./domain";

export const DEFAULT_SIGNAL_THRESHOLDS: SignalThresholds = {
  buyAbove: 0.6,
  sellBelow: 0.4,
  minChange: 0.15,
};

export function toSignals(
  dates: string[],
  targetWeights: number[],
  reasonsByDay: string[][],
  thresholds: SignalThresholds = DEFAULT_SIGNAL_THRESHOLDS
): Signal[] {
  const { buyAbove, sellBelow, minChange } = thresholds;

  return dates.map((date, i) => {
    const tw = clamp(targetWeights[i] ?? 0, 0, 1);
    const prev = i > 0 ? clamp(targetWeights[i - 1] ?? 0, 0, 1) : tw;
    const delta = tw - prev;

    let action: Action = "HOLD";

    const crossedBuy = prev <= buyAbove && tw > buyAbove;
    const crossedSell = prev >= sellBelow && tw < sellBelow;

    if (crossedBuy || delta >= minChange) action = "BUY";
    else if (crossedSell || delta <= -minChange) action = "SELL";

    const dist =
      action === "BUY" ? Math.max(0, tw - buyAbove) : action === "SELL" ? Math.max(0, sellBelow - tw) : 0;
    const confidence = clamp(0.4 + dist * 1.5 + Math.min(0.3, Math.abs(delta)), 0, 1);

    const reasons = reasonsByDay?.[i] ? [...reasonsByDay[i]] : [];
    reasons.unshift(`ensemble target=${Math.round(tw * 100)}% (Δ=${Math.round(delta * 100)}%)`);

    return { date, action, targetWeight: tw, confidence, reasons };
  });
}
