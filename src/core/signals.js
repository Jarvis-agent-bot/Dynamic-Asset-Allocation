import { ensembleTargetWeights } from "./ensemble.js";
import { DEFAULT_SIGNAL_THRESHOLDS, toSignals } from "./signalMapping.js";

export { ensembleTargetWeights, DEFAULT_SIGNAL_THRESHOLDS, toSignals };

/** Convenience wrapper */
export function ensembleSignals(strategies, series, weightsConfig, thresholds = DEFAULT_SIGNAL_THRESHOLDS) {
  const { dates, targetWeights, reasonsByDay } = ensembleTargetWeights(strategies, series, weightsConfig);
  return toSignals(dates, targetWeights, reasonsByDay, thresholds);
}
