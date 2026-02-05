/** math helpers */

export function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

export function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function cumulativeProduct(returns, start = 1) {
  const eq = [];
  let v = start;
  for (const r of returns) {
    v = v * (1 + r);
    eq.push(v);
  }
  return eq;
}

export function maxDrawdown(equity) {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of equity) {
    peak = Math.max(peak, v);
    if (peak > 0) {
      const dd = (v - peak) / peak;
      mdd = Math.min(mdd, dd);
    }
  }
  return Math.abs(mdd);
}
