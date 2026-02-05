import { clamp } from "../math";
import { assertNonNegativeWeights, normalizeWeights } from "../config";
import type { PriceBar, Strategy } from "../domain";

export function ensembleTargetWeights(
  strategies: Strategy[],
  series: PriceBar[],
  weightsConfig: Record<string, number>
): { dates: string[]; targetWeights: number[]; reasonsByDay: string[][] } {
  assertNonNegativeWeights(weightsConfig);

  // Contract: strategy ids must be unique. Duplicate ids would overwrite each other
  // in the weights map and silently degrade signal quality.
  const stratIds = new Set(strategies.map((s) => s.id));
  if (stratIds.size !== strategies.length) {
    throw new Error("Strategy ids must be unique in ensembleTargetWeights() input");
  }

  // Contract: weightsConfig should not silently contain unknown strategy ids.
  // Unknown weights would otherwise dilute normalization and degrade signal quality.
  const unknown = Object.entries(weightsConfig).filter(([id, raw]) => !stratIds.has(id) && Number(raw) !== 0);
  if (unknown.length > 0) {
    const ids = unknown.map(([id]) => id).join(", ");
    throw new Error(`Unknown strategy id(s) in weightsConfig: ${ids}`);
  }

  // Normalize only across the strategies that are actually part of this ensemble.
  const weightsForStrats = Object.fromEntries(strategies.map((s) => [s.id, Number(weightsConfig[s.id] ?? 0)]));

  // Contract: at least one included strategy must have a positive weight.
  // Otherwise we'd silently normalize to all-zeros and emit a perpetual 0% target.
  const sumIncludedWeights = Object.values(weightsForStrats).reduce((acc, v) => acc + (Number(v) || 0), 0);
  if (sumIncludedWeights <= 0) {
    throw new Error("weightsConfig must assign a positive weight to at least one strategy in the ensemble");
  }

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

  const pct = (x: number): string => {
    // Keep signal explanations readable while avoiding misleading rounding.
    const p = clamp(Number(x) || 0, 0, 1) * 100;
    const s = p.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };

  const reasonsByDay = dates.map((_, i) => {
    return perStrat
      .filter((s) => s.weight > 0)
      .map((s) => `${s.name}: ${pct(s.ws[i])}% (w=${pct(s.weight)}%)`);
  });

  return { dates, targetWeights, reasonsByDay };
}
