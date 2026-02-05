import { clamp } from "../math";
import { assertNonNegativeWeights, normalizeWeights } from "../config";
import type { PriceBar, Strategy } from "../domain";
import { pct01 } from "../format";

export function ensembleTargetWeights(
  strategies: Strategy[],
  series: PriceBar[],
  weightsConfig: Record<string, number>
): { dates: string[]; targetWeights: number[]; reasonsByDay: string[][] } {
  if (strategies.length === 0) {
    throw new Error("ensembleTargetWeights() requires at least one strategy");
  }
  if (series.length === 0) {
    throw new Error("ensembleTargetWeights() requires a non-empty price series");
  }

  assertNonNegativeWeights(weightsConfig);

  // Contract: strategy ids must be unique. Duplicate ids would overwrite each other
  // in the weights map and silently degrade signal quality.
  const ids = strategies.map((s) => s.id);
  const stratIds = new Set(ids);
  if (stratIds.size !== strategies.length) {
    const counts = ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const dups = Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([id]) => id)
      .join(", ");

    throw new Error(
      `Strategy ids must be unique in ensembleTargetWeights() input${dups ? ` (duplicates: ${dups})` : ""}`
    );
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

  // Contract: series dates must be strictly increasing to ensure we don't generate
  // ambiguous signals or misordered backtests.
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] <= dates[i - 1]) {
      throw new Error(
        `Price series dates must be strictly increasing (got ${dates[i - 1]} then ${dates[i]} at index ${i})`
      );
    }
  }

  const perStrat = strategies.map((s) => {
    const raw = s.weights(series);
    if (raw.length !== series.length) {
      throw new Error(`weights length mismatch: ${s.id} expected=${series.length} got=${raw.length}`);
    }

    // Contract: strategy weights must be finite numbers in [0, 1].
    // Non-finite or out-of-range values would otherwise get coerced/clamped and silently degrade signal quality.
    for (let i = 0; i < raw.length; i++) {
      const v = Number(raw[i]);
      if (!Number.isFinite(v)) {
        throw new Error(`Non-finite weight from ${s.id} at index ${i}: ${String(raw[i])}`);
      }
      if (v < 0 || v > 1) {
        throw new Error(`Out-of-range weight from ${s.id} at index ${i}: ${String(raw[i])} (expected 0..1)`);
      }
    }

    const ws = raw.map((x) => clamp(Number(x), 0, 1));

    return { id: s.id, name: s.name, ws, weight: Number(wNorm[s.id] || 0) };
  });

  const targetWeights = dates.map((_, i) => {
    let sum = 0;
    for (const s of perStrat) sum += s.weight * s.ws[i];
    return clamp(sum, 0, 1);
  });

  const reasonsByDay = dates.map((_, i) => {
    // Sort strategy contributions by magnitude for clearer explainability.
    // Contribution is proportional to normalized ensemble weight * strategy weight signal.
    return perStrat
      .filter((s) => s.weight > 0)
      .slice()
      .sort((a, b) => b.weight * b.ws[i] - a.weight * a.ws[i])
      .map((s) => {
        const contrib = s.weight * s.ws[i];
        return `${s.name}: ${pct01(s.ws[i])}% (w=${pct01(s.weight)}%, contrib=${pct01(contrib)}%)`;
      });
  });

  return { dates, targetWeights, reasonsByDay };
}
