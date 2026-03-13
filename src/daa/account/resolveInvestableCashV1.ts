function toFiniteNumberV1(value: unknown, fallback = Number.NaN): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveInvestableCashV1(input: {
  cash: unknown;
  frozenCash: unknown;
  investableCash: unknown;
}): number {
  const cash = Math.max(0, toFiniteNumberV1(input.cash, 0));
  const frozenCash = Math.max(0, toFiniteNumberV1(input.frozenCash, 0));
  const fallback = Math.max(0, cash - frozenCash);
  const raw = toFiniteNumberV1(input.investableCash, Number.NaN);
  if (!Number.isFinite(raw)) return fallback;
  if (raw <= 0 && cash > 0 && frozenCash < cash) return fallback;
  return Math.max(0, Math.min(cash, raw));
}
