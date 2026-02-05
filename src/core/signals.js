import { clamp } from "./math.js";
import { normalizeWeights } from "./config.js";

/**
 * @typedef {'BUY'|'SELL'|'HOLD'} Action
 */

/**
 * @typedef {Object} Signal
 * @property {string} date
 * @property {Action} action
 * @property {number} targetWeight
 * @property {number} confidence 0..1 (heuristic)
 * @property {string[]} reasons
 */

export const DEFAULT_SIGNAL_THRESHOLDS = {
  buyAbove: 0.6,
  sellBelow: 0.4,
  // optional hysteresis / change sensitivity
  minChange: 0.15,
};

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

/**
 * Map ensemble target weights into BUY/SELL/HOLD signals.
 *
 * Rules (v0, neutral defaults):
 * - BUY when targetWeight crosses above buyAbove OR increases by >=minChange.
 * - SELL when targetWeight crosses below sellBelow OR decreases by >=minChange.
 * - Else HOLD.
 *
 * @param {string[]} dates
 * @param {number[]} targetWeights
 * @param {string[][]} reasonsByDay
 * @param {{buyAbove:number,sellBelow:number,minChange:number}} thresholds
 * @returns {Signal[]}
 */
export function toSignals(dates, targetWeights, reasonsByDay, thresholds = DEFAULT_SIGNAL_THRESHOLDS) {
  const buyAbove = thresholds.buyAbove;
  const sellBelow = thresholds.sellBelow;
  const minChange = thresholds.minChange;

  return dates.map((date, i) => {
    const tw = clamp(targetWeights[i] ?? 0, 0, 1);
    const prev = i > 0 ? clamp(targetWeights[i - 1] ?? 0, 0, 1) : tw;
    const delta = tw - prev;

    let action = /** @type {Action} */ ("HOLD");

    const crossedBuy = prev <= buyAbove && tw > buyAbove;
    const crossedSell = prev >= sellBelow && tw < sellBelow;

    if (crossedBuy || delta >= minChange) action = "BUY";
    else if (crossedSell || delta <= -minChange) action = "SELL";

    // heuristic confidence: distance from neutral band + magnitude of change
    const dist = action === "BUY" ? Math.max(0, tw - buyAbove) : action === "SELL" ? Math.max(0, sellBelow - tw) : 0;
    const confidence = clamp(0.4 + dist * 1.5 + Math.min(0.3, Math.abs(delta)), 0, 1);

    const reasons = reasonsByDay?.[i] ? [...reasonsByDay[i]] : [];
    reasons.unshift(`ensemble target=${Math.round(tw * 100)}% (Δ=${Math.round(delta * 100)}%)`);

    return { date, action, targetWeight: tw, confidence, reasons };
  });
}

/** Convenience wrapper */
export function ensembleSignals(strategies, series, weightsConfig, thresholds = DEFAULT_SIGNAL_THRESHOLDS) {
  const { dates, targetWeights, reasonsByDay } = ensembleTargetWeights(strategies, series, weightsConfig);
  return toSignals(dates, targetWeights, reasonsByDay, thresholds);
}
