import { clamp } from "./math";
import type { Signal, SignalThresholds } from "./domain";
import { computeConfidence, decideActionWithReason } from "./signalDecision";
import { assertValidSignalThresholds } from "./signalThresholds";
import { pct01, signedPct } from "./format";

export const DEFAULT_SIGNAL_THRESHOLDS: SignalThresholds = {
  buyAbove: 0.6,
  sellBelow: 0.4,
  minChange: 0.15,
};

export function toSignals(
  dates: string[],
  targetWeights: number[],
  reasonsByDay: string[][] = [],
  thresholds: SignalThresholds = DEFAULT_SIGNAL_THRESHOLDS
): Signal[] {
  if (dates.length !== targetWeights.length) {
    throw new Error(
      `toSignals contract violation: dates.length (${dates.length}) must equal targetWeights.length (${targetWeights.length})`
    );
  }

  if (reasonsByDay.length > 0 && reasonsByDay.length !== dates.length) {
    throw new Error(
      `toSignals contract violation: reasonsByDay.length (${reasonsByDay.length}) must equal dates.length (${dates.length}) when provided`
    );
  }

  assertValidSignalThresholds(thresholds);

  return dates.map((date, i) => {
    const rawTw = targetWeights[i] ?? 0;
    const rawPrev = i > 0 ? (targetWeights[i - 1] ?? 0) : rawTw;

    const warnings: string[] = [];

    // Defensive: avoid NaN/Infinity leaking into signals.
    const twIsFinite = Number.isFinite(rawTw);
    const tw = clamp(twIsFinite ? rawTw : 0, 0, 1);
    if (!twIsFinite) {
      warnings.push("warning: non-finite targetWeight treated as 0");
    } else if (tw !== rawTw) {
      warnings.push(`warning: targetWeight out of range; clamped from ${rawTw} to ${tw}`);
    }

    const prevIsFinite = Number.isFinite(rawPrev);
    // If the previous day is non-finite, default prev=tw (so Δ=0) to avoid spurious jumps.
    const prev = clamp(prevIsFinite ? rawPrev : tw, 0, 1);
    if (!prevIsFinite && i > 0) {
      warnings.push("warning: previous targetWeight non-finite; Δ forced to 0");
    } else if (prevIsFinite && prev !== rawPrev && i > 0) {
      warnings.push(`warning: previous targetWeight out of range; clamped from ${rawPrev} to ${prev}`);
    }

    const delta = tw - prev;

    const { action, reason: decisionReason } = decideActionWithReason(prev, tw, thresholds);
    const confidence = computeConfidence(action, prev, tw, thresholds);

    const dayReasons = reasonsByDay?.[i];
    if (dayReasons != null && !Array.isArray(dayReasons)) {
      throw new Error(`toSignals contract violation: reasonsByDay[${i}] must be an array of strings when provided`);
    }
    if (Array.isArray(dayReasons)) {
      for (let j = 0; j < dayReasons.length; j++) {
        if (typeof dayReasons[j] !== "string") {
          throw new Error(
            `toSignals contract violation: reasonsByDay[${i}][${j}] must be a string (got ${typeof dayReasons[j]})`
          );
        }
      }
    }

    const reasons = Array.isArray(dayReasons) ? [...dayReasons] : [];

    reasons.unshift(`ensemble target=${pct01(tw)}% (Δ=${signedPct(delta)}%)`);
    // Put the decision rule right after the headline target/Δ line.
    reasons.splice(1, 0, decisionReason);
    if (warnings.length) {
      reasons.splice(2, 0, ...warnings);
    }

    return { date, action, targetWeight: tw, confidence, reasons };
  });
}

