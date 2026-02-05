import { clamp } from "./math";
import type { Signal, SignalThresholds } from "./domain";
import { computeConfidence, decideAction } from "./signalDecision";

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
  return dates.map((date, i) => {
    const tw = clamp(targetWeights[i] ?? 0, 0, 1);
    const prev = i > 0 ? clamp(targetWeights[i - 1] ?? 0, 0, 1) : tw;
    const delta = tw - prev;

    const action = decideAction(prev, tw, thresholds);
    const confidence = computeConfidence(action, prev, tw, thresholds);

    const reasons = reasonsByDay?.[i] ? [...reasonsByDay[i]] : [];
    reasons.unshift(`ensemble target=${Math.round(tw * 100)}% (Δ=${Math.round(delta * 100)}%)`);

    return { date, action, targetWeight: tw, confidence, reasons };
  });
}
