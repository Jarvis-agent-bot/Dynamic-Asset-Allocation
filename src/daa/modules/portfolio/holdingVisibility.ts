export const MIN_VISIBLE_HOLDING_VALUE_BASE = 1;
const MIN_VISIBLE_HOLDING_WEIGHT_PCT = 0.01;

export type HoldingVisibilityInput = {
  holdingQty?: unknown;
  valuationBase?: unknown;
  lastPrice?: unknown;
  fxRateToBase?: unknown;
  actualWeightPct?: unknown;
};

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function getHoldingDisplayValueBase(row: HoldingVisibilityInput): number | null {
  const valuationBase = finiteNumber(row.valuationBase);
  if (valuationBase != null) return Math.abs(valuationBase);

  const qty = finiteNumber(row.holdingQty);
  const price = finiteNumber(row.lastPrice);
  const fxRate = finiteNumber(row.fxRateToBase);
  if (qty != null && price != null && fxRate != null && price > 0 && fxRate > 0) {
    return Math.abs(qty * price * fxRate);
  }

  return null;
}

export function isVisibleHolding(row: HoldingVisibilityInput): boolean {
  if (!(Number(row.holdingQty) > 0)) return false;

  const valueBase = getHoldingDisplayValueBase(row);
  if (valueBase != null) return valueBase >= MIN_VISIBLE_HOLDING_VALUE_BASE;

  const actualWeightPct = finiteNumber(row.actualWeightPct);
  if (actualWeightPct != null && Math.abs(actualWeightPct) > 0) {
    return Math.abs(actualWeightPct) >= MIN_VISIBLE_HOLDING_WEIGHT_PCT;
  }

  return true;
}

export function filterVisibleHoldings<T extends HoldingVisibilityInput>(rows: T[]): T[] {
  return rows.filter(isVisibleHolding);
}

export function countVisibleHoldings(rows: HoldingVisibilityInput[]): number {
  return filterVisibleHoldings(rows).length;
}
