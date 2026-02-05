import type { SignalThresholds } from "./domain";

/**
 * Shared validation for signal threshold contracts.
 *
 * Keep this centralized so signal generation + mapping cannot drift.
 */
export function assertValidSignalThresholds(thresholds: SignalThresholds): void {
  const { buyAbove, sellBelow, minChange } = thresholds;

  for (const [k, v] of Object.entries({ buyAbove, sellBelow, minChange })) {
    if (!Number.isFinite(v)) throw new Error(`Signal threshold ${k} must be a finite number`);
  }

  if (buyAbove < 0 || buyAbove > 1) throw new Error(`Signal threshold buyAbove must be within [0,1]`);
  if (sellBelow < 0 || sellBelow > 1) throw new Error(`Signal threshold sellBelow must be within [0,1]`);
  if (minChange < 0 || minChange > 1) throw new Error(`Signal threshold minChange must be within [0,1]`);

  // Contract: the neutral band is [sellBelow, buyAbove] with non-zero width.
  // We require sellBelow < buyAbove to avoid ambiguous equality edge cases.
  if (sellBelow >= buyAbove) throw new Error(`Signal threshold sellBelow must be < buyAbove`);
}
