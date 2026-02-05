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
  if (dates.length !== targetWeights.length) {
    throw new Error(`toSignals contract violation: dates.length (${dates.length}) must equal targetWeights.length (${targetWeights.length})`);
  }

  if (reasonsByDay.length > 0 && reasonsByDay.length !== dates.length) {
    throw new Error(`toSignals contract violation: reasonsByDay.length (${reasonsByDay.length}) must equal dates.length (${dates.length}) when provided`);
  }

  return dates.map((date, i) => {
    const rawTw = targetWeights[i] ?? 0;
    const rawPrev = i > 0 ? (targetWeights[i - 1] ?? 0) : rawTw;

    // Defensive: avoid NaN/Infinity leaking into signals.
    const tw = clamp(Number.isFinite(rawTw) ? rawTw : 0, 0, 1);
    const prev = clamp(Number.isFinite(rawPrev) ? rawPrev : tw, 0, 1);
    const delta = tw - prev;

    const action = decideAction(prev, tw, thresholds);
    const confidence = computeConfidence(action, prev, tw, thresholds);

    const reasons = reasonsByDay?.[i] ? [...reasonsByDay[i]] : [];

    const deltaPct = Math.round(delta * 100);
    const deltaLabel = deltaPct > 0 ? `+${deltaPct}` : String(deltaPct);
    reasons.unshift(`ensemble target=${Math.round(tw * 100)}% (Δ=${deltaLabel}%)`);

    return { date, action, targetWeight: tw, confidence, reasons };
  });
}
