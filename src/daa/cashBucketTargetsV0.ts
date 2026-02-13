export function normalizeCashBucketTargetPct01V0(x: unknown): number {
  const raw = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(raw)) return 0;

  // Convenience: allow percentages like 20 (meaning 20%).
  const pct01 = raw > 1 && raw <= 100 ? raw / 100 : raw;

  if (!Number.isFinite(pct01)) return 0;
  if (pct01 <= 0) return 0;

  // Avoid pathological values that would make the investable slice ~0.
  return Math.min(0.95, pct01);
}

export function deriveInvestablePct01V0(args: {
  // If present, comes from money_plan.account.investable/totalEquity.
  moneyPlanInvestablePct01: number | null;
  // User target cash bucket percentage (0..1). This increases the cash buffer.
  targetCashPct01: unknown;
}): number {
  const manualCashPct01 = normalizeCashBucketTargetPct01V0(args.targetCashPct01);
  const manualInvestablePct01 = Math.max(0, Math.min(1, 1 - manualCashPct01));

  const mp = args.moneyPlanInvestablePct01;
  const mpOk = typeof mp === "number" && Number.isFinite(mp) && mp >= 0 && mp <= 1;

  // If money plan already enforces a smaller investable slice, keep it.
  return mpOk ? Math.min(mp, manualInvestablePct01) : manualInvestablePct01;
}

export function scaleTargetWeightsByInvestablePct01V0<T extends { targetPct: number }>(
  weights: T[],
  investablePct01: number
): T[] {
  if (!Array.isArray(weights) || !weights.length) return [];

  const pct = typeof investablePct01 === "number" ? investablePct01 : Number(investablePct01);
  if (!Number.isFinite(pct) || pct >= 1) return weights;
  if (pct <= 0) return weights.map((t) => ({ ...t, targetPct: 0 }));

  return weights.map((t) => ({ ...t, targetPct: t.targetPct * pct }));
}
