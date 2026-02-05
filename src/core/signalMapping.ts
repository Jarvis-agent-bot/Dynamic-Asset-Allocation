import { clamp } from "./math";
import type { Signal, SignalThresholds } from "./domain";
import { computeConfidence, decideAction } from "./signalDecision";

export const DEFAULT_SIGNAL_THRESHOLDS: SignalThresholds = {
  buyAbove: 0.6,
  sellBelow: 0.4,
  minChange: 0.15,
};

function assertSignalThresholds(t: SignalThresholds): void {
  const bad = (k: keyof SignalThresholds, msg: string) => {
    throw new Error(`Invalid signal threshold '${k}': ${msg}`);
  };

  for (const k of ["buyAbove", "sellBelow", "minChange"] as const) {
    const v = t[k];
    if (!Number.isFinite(v)) bad(k, "must be a finite number");
    if (v < 0 || v > 1) bad(k, "must be between 0 and 1");
  }

  if (t.buyAbove <= t.sellBelow) {
    throw new Error(`Invalid signal thresholds: buyAbove (${t.buyAbove}) must be > sellBelow (${t.sellBelow})`);
  }
}

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

  assertSignalThresholds(thresholds);

  const pct = (x: number): string => {
    // Keep signal explanations readable while avoiding misleading rounding.
    const p = clamp(Number(x) || 0, 0, 1) * 100;
    const s = p.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };

  const signedPct = (x: number): string => {
    const p = (Number(x) || 0) * 100;
    // Use a single decimal (trimmed) to avoid hiding meaningful small changes.
    const abs = Math.abs(p);
    const s = abs.toFixed(1);
    const trimmed = s.endsWith(".0") ? s.slice(0, -2) : s;
    const sign = p > 0 ? "+" : p < 0 ? "-" : "";
    return `${sign}${trimmed}`;
  };

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

    reasons.unshift(`ensemble target=${pct(tw)}% (Δ=${signedPct(delta)}%)`);

    return { date, action, targetWeight: tw, confidence, reasons };
  });
}
