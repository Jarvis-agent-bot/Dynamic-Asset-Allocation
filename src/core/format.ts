import { clamp } from "./math";

/**
 * Format a weight in [0,1] as a human-friendly percentage.
 *
 * - clamps into [0,1]
 * - keeps 1 decimal, but trims trailing .0 (e.g. 60.0 -> 60)
 */
export function pct01(x: number): string {
  const p = clamp(Number(x) || 0, 0, 1) * 100;
  const s = p.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/**
 * Format a delta (not clamped) as a signed percentage.
 *
 * - uses an explicit + sign for positive values
 * - keeps 1 decimal, but trims trailing .0
 */
export function signedPct(x: number): string {
  const p = (Number(x) || 0) * 100;
  const abs = Math.abs(p);
  const s = abs.toFixed(1);
  const trimmed = s.endsWith(".0") ? s.slice(0, -2) : s;
  const sign = p > 0 ? "+" : p < 0 ? "-" : "";
  return `${sign}${trimmed}`;
}
