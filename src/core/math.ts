/** math helpers */

export function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function cumulativeProduct(returns: number[], start = 1): number[] {
  const eq: number[] = [];
  let v = start;
  for (const rRaw of returns) {
    // Defensive: treat non-finite returns as 0% so we don't pollute the whole equity curve.
    const r = Number.isFinite(rRaw) ? rRaw : 0;
    const next = v * (1 + r);
    v = Number.isFinite(next) ? next : v;
    eq.push(v);
  }
  return eq;
}

export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let mdd = 0;

  for (const vRaw of equity) {
    // Defensive: ignore non-finite values so a single NaN doesn't poison the whole scan.
    const v = Number.isFinite(vRaw) ? vRaw : null;
    if (v === null) continue;

    peak = Math.max(peak, v);
    if (peak > 0) {
      const dd = (v - peak) / peak;
      mdd = Math.min(mdd, dd);
    }
  }

  return Math.abs(mdd);
}
