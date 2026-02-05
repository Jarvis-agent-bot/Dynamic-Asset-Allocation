import { assertNonNegativeWeights } from "./config";
import type { PriceBar, Signal, SignalThresholds, Strategy } from "./domain";
import { ensembleTargetWeights } from "./ensemble";
import { DEFAULT_SIGNAL_THRESHOLDS, toSignals } from "./signalMapping";

export { DEFAULT_SIGNAL_THRESHOLDS } from "./signalMapping";

export function ensembleSignals(
  strategies: Strategy[],
  series: PriceBar[],
  weightsConfig: Record<string, number>,
  thresholds: SignalThresholds = DEFAULT_SIGNAL_THRESHOLDS
): Signal[] {
  // ensure we don't accept negative weights silently
  assertNonNegativeWeights(weightsConfig);
  const { dates, targetWeights, reasonsByDay } = ensembleTargetWeights(strategies, series, weightsConfig);
  return toSignals(dates, targetWeights, reasonsByDay, thresholds);
}
