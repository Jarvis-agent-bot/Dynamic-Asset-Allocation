export type LiquiditySettlementGateV0 = {
  settlementLagDays: number;
  estimatedBuys: number;
  estimatedSells: number;
  availableCash: number;
  settledLiquidityCoverage: number;
  cashGap: number;
  blocked: boolean;
  message: string;
};

function toFiniteNumber(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function getLiquiditySettlementGateV0(args: {
  estimatedBuys: unknown;
  estimatedSells: unknown;
  availableCash: unknown;
  settlementLagDays: unknown;
  baseCcy?: string | null;
}): LiquiditySettlementGateV0 {
  const estimatedBuys = Math.max(0, toFiniteNumber(args.estimatedBuys));
  const estimatedSells = Math.max(0, toFiniteNumber(args.estimatedSells));
  const availableCash = Math.max(0, toFiniteNumber(args.availableCash));
  const settlementLagDays = Math.max(0, Math.trunc(toFiniteNumber(args.settlementLagDays)));

  const settledLiquidityCoverage = availableCash + (settlementLagDays === 0 ? estimatedSells : 0);
  const cashGap = Math.max(0, estimatedBuys - settledLiquidityCoverage);
  const blocked = cashGap > 1e-6;
  const ccy = args.baseCcy ? ` ${args.baseCcy}` : "";

  const message = blocked
    ? `Liquidity/settlement gate blocked: T+${settlementLagDays} settled cash coverage is ${settledLiquidityCoverage.toFixed(2)}${ccy}, short by ${cashGap.toFixed(2)}${ccy}. Split into sell-then-buy or add cash.`
    : `Liquidity/settlement gate clear: T+${settlementLagDays} settled cash coverage is ${settledLiquidityCoverage.toFixed(2)}${ccy}.`;

  return {
    settlementLagDays,
    estimatedBuys,
    estimatedSells,
    availableCash,
    settledLiquidityCoverage,
    cashGap,
    blocked,
    message,
  };
}
