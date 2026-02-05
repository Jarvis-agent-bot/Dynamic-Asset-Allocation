import { clamp } from "../math";
import { assertNonNegativeWeights, normalizeWeights } from "../config";
import type { PriceBar, Strategy } from "../domain";

export function ensembleTargetWeights(
  strategies: Strategy[],
  series: PriceBar[],
  weightsConfig: Record<string, number>
): { dates: string[]; targetWeights: number[]; reasonsByDay: string[][] } {
  assertNonNegativeWeights(weightsConfig);

  // Contract: weightsConfig should not silently contain unknown strategy ids.
  // Unknown weights would otherwise dilute normalization and degrade signal quality.
  const stratIds = new Set(strategies.map((s) => s.id));
  const unknown = Object.entries(weightsConfig).filter(([id, raw]) => !stratIds.has(id) && Number(raw) !== 0);
  if (unknown.length > 0) {
    const ids = unknown.map(([id]) => id).join(", ");
    throw new Error(`Unknown strategy id(s) in weightsConfig: ${ids}`);
  }

  // Normalize only across the strategies that are actually part of this ensemble.
  const weightsForStrats = Object.fromEntries(strategies.map((s) => [s.id, Number(weightsConfig[s.id] ?? 0)]));
  const wNorm = normalizeWeights(weightsForStrats);

  const dates = series.map((b) => b.date);

  const perStrat = strategies.map((s) => {
    const ws = s.weights(series).map((x) => clamp(Number(x) || 0, 0, 1));
    if (ws.length !== series.length) throw new Error(`weights length mismatch for ${s.id}`);
    return { id: s.id, name: s.name, ws, weight: Number(wNorm[s.id] || 0) };
  });

  const targetWeights = dates.map((_, i) => {
    let sum = 0;
    for (const s of perStrat) sum += s.weight * s.ws[i];
    return clamp(sum, 0, 1);
  });

  const reasonsByDay = dates.map((_, i) => {
    return perStrat
      .filter((s) => s.weight > 0)
      .map((s) => `${s.name}: ${Math.round(s.ws[i] * 100)}% (w=${Math.round(s.weight * 100)}%)`);
  });

  return { dates, targetWeights, reasonsByDay };
}
