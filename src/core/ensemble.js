import { clamp } from "./math.js";
import { normalizeWeights } from "./config.js";

/**
 * Combine multiple strategy weight series (single-asset) into an ensemble target weight series.
 *
 * @param {Array<{id:string,name:string,weights:(series:any[])=>number[]}>} strategies
 * @param {Array<{date:string,close:number}>} series
 * @param {Record<string, number>} weightsConfig
 * @returns {{ dates: string[], targetWeights: number[], reasonsByDay: string[][] }}
 */
export function ensembleTargetWeights(strategies, series, weightsConfig) {
  const wNorm = normalizeWeights(weightsConfig);
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
    // keep minimal, transparent reasons
    return perStrat
      .filter((s) => s.weight > 0)
      .map((s) => `${s.name}: ${Math.round(s.ws[i] * 100)}% (w=${Math.round(s.weight * 100)}%)`);
  });

  return { dates, targetWeights, reasonsByDay };
}
