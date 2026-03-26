import { toFinite } from "@/src/daa/utils/normalize";

export function resolveInvestableCash(input: {
  cash: unknown;
  frozenCash: unknown;
  investableCash: unknown;
}): number {
  const cash = Math.max(0, toFinite(input.cash, 0));
  const frozenCash = Math.max(0, toFinite(input.frozenCash, 0));
  const fallback = Math.max(0, cash - frozenCash);
  const raw = toFinite(input.investableCash, NaN);
  if (!Number.isFinite(raw)) return fallback;
  if (raw <= 0 && cash > 0 && frozenCash < cash) return fallback;
  return Math.max(0, Math.min(cash, raw));
}
