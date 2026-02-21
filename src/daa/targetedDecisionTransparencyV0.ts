export type TargetedDecisionTransparencyRowV0 = {
  id: string;
  label: string;
  currentPct: number;
  targetPct: number;
  deltaPct: number;
};

export type TargetedDecisionTransparencyDetailV0 = {
  symbol: string;
  label: string;
  currentPct: number;
  targetPct: number;
  driftPct: number;
  price: number | null;
  priceSource: string;
  policyGate: boolean;
  liquidityGate: boolean;
  cashGate: boolean;
  violationsGate: boolean;
  rationale: string;
};

export function buildTargetedDecisionTransparencyV0(args: {
  rebalanceTableRows: TargetedDecisionTransparencyRowV0[];
  driftThresholdPct: number;
  cashBlocked: boolean;
  liquidityBlocked: boolean;
  hasBlockingViolation: boolean;
  resolvePrice: (symbol: string) => { price: number | null; source: string };
}): TargetedDecisionTransparencyDetailV0 | null {
  if (!args.rebalanceTableRows.length) return null;

  const row = args.rebalanceTableRows[0];
  if (!row) return null;

  const symbol = String(row.id ?? "").trim();
  if (!symbol) return null;

  const pricePick = args.resolvePrice(symbol);
  const driftPct = Number.isFinite(row.deltaPct) ? row.deltaPct : 0;
  const policyGate = Math.abs(driftPct) >= args.driftThresholdPct;

  let rationale = "Hold: drift is inside threshold.";
  if (policyGate && driftPct > 0) {
    rationale = "Trim: current allocation is above target and drift gate is open.";
  }
  if (policyGate && driftPct < 0) {
    rationale = "Add: current allocation is below target and drift gate is open.";
  }
  if (args.cashBlocked || args.liquidityBlocked) {
    rationale += " Order routing stays blocked until cash/settlement gate clears.";
  }

  return {
    symbol,
    label: String(row.label ?? symbol),
    currentPct: Number.isFinite(row.currentPct) ? row.currentPct : 0,
    targetPct: Number.isFinite(row.targetPct) ? row.targetPct : 0,
    driftPct,
    price: pricePick.price,
    priceSource: String(pricePick.source ?? "missing"),
    policyGate,
    liquidityGate: !args.liquidityBlocked,
    cashGate: !args.cashBlocked,
    violationsGate: !args.hasBlockingViolation,
    rationale,
  };
}
