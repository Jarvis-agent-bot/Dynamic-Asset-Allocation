import type { PositionPnlRow } from "./positionPnl";

export type PositionMaterialityOptions = {
  minNotionalBase?: number | null;
  minQtyEpsilon?: number | null;
};

export const DEFAULT_POSITION_MIN_QTY_EPSILON = 1e-8;

export type PositionMaterialityReason =
  | "actionable"
  | "no_quantity"
  | "tiny_quantity"
  | "low_notional"
  | "invalid_valuation";

export type PositionMaterialityEvaluation = {
  actionable: boolean;
  reason: PositionMaterialityReason;
  holdingQty: number | null;
  valuationBase: number | null;
  minNotionalBase: number;
  minQtyEpsilon: number;
};

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

export function buildPositionMaterialityOptions(input: {
  minNotionalBase?: number | null;
  minQtyEpsilon?: number | null;
}): PositionMaterialityOptions {
  return {
    minNotionalBase: nonNegativeNumber(input.minNotionalBase, 0),
    minQtyEpsilon: nonNegativeNumber(input.minQtyEpsilon, DEFAULT_POSITION_MIN_QTY_EPSILON),
  };
}

export function evaluatePositionMateriality(
  row: Pick<PositionPnlRow, "holdingQty" | "valuationBase">,
  options: PositionMaterialityOptions = {},
): PositionMaterialityEvaluation {
  const holdingQty = toFiniteNumber(row.holdingQty);
  const valuationBase = toFiniteNumber(row.valuationBase);
  const minNotionalBase = nonNegativeNumber(options.minNotionalBase, 0);
  const minQtyEpsilon = nonNegativeNumber(options.minQtyEpsilon, 0);

  const base = {
    holdingQty,
    valuationBase,
    minNotionalBase,
    minQtyEpsilon,
  };

  if (holdingQty == null || holdingQty <= 0) {
    return { ...base, actionable: false, reason: "no_quantity" };
  }
  if (minQtyEpsilon > 0 && holdingQty <= minQtyEpsilon) {
    return { ...base, actionable: false, reason: "tiny_quantity" };
  }
  if (valuationBase != null && valuationBase < 0) {
    return { ...base, actionable: false, reason: "invalid_valuation" };
  }
  if (minNotionalBase > 0 && valuationBase != null && valuationBase + 1e-9 < minNotionalBase) {
    return { ...base, actionable: false, reason: "low_notional" };
  }

  return { ...base, actionable: true, reason: "actionable" };
}
