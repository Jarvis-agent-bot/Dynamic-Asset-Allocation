import { toFinite } from "@/src/daa/utils/normalize";

export type OrderSide = "BUY" | "SELL";

export type OrderSizingSpec = {
  minNotionalBase: number;
  minQty: number;
  qtyStep: number;
  priceTick: number;
};

export type NormalizeOrderSizingInput = {
  side: OrderSide;
  market?: string | null;
  assetClass?: string | null;
  instrumentType?: string | null;
  marketGroup?: string | null;
  price: number;
  fxRateToBase?: number | null;
  qty?: number | null;
  notionalBase?: number | null;
  holdingQty?: number | null;
  sellAll?: boolean;
  minNotionalBase?: number | null;
};

export type NormalizeOrderSizingResult = {
  qty: number;
  price: number;
  notionalBase: number;
  spec: OrderSizingSpec;
  sellAll: boolean;
  warnings: string[];
};

function normalizeUpper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isCryptoLike(input: Pick<NormalizeOrderSizingInput, "market" | "assetClass" | "instrumentType" | "marketGroup">): boolean {
  const market = normalizeUpper(input.market);
  const assetClass = normalizeUpper(input.assetClass);
  const instrumentType = normalizeUpper(input.instrumentType);
  const marketGroup = normalizeUpper(input.marketGroup);
  return market === "CRYPTO"
    || assetClass === "CRYPTO"
    || instrumentType === "CRYPTO"
    || marketGroup.includes("CRYPTO");
}

function resolvePriceTick(price: number, crypto: boolean): number {
  if (crypto) return price >= 1 ? 0.01 : 0.00000001;
  if (price >= 1) return 0.01;
  if (price >= 0.01) return 0.0001;
  return 0.000001;
}

export function resolveOrderSizingSpec(input: NormalizeOrderSizingInput): OrderSizingSpec {
  const price = Math.max(0, toFinite(input.price, 0));
  const crypto = isCryptoLike(input);
  return {
    minNotionalBase: Math.max(0, toFinite(input.minNotionalBase, 0)),
    minQty: crypto ? 0.00000001 : 0.000001,
    qtyStep: crypto ? 0.00000001 : 0.000001,
    priceTick: resolvePriceTick(price, crypto),
  };
}

function floorToStep(value: number, step: number): number {
  if (!(Number.isFinite(value) && value > 0)) return 0;
  if (!(Number.isFinite(step) && step > 0)) return value;
  return Math.floor(value / step + 1e-12) * step;
}

function roundToTick(value: number, tick: number): number {
  if (!(Number.isFinite(value) && value > 0)) return 0;
  if (!(Number.isFinite(tick) && tick > 0)) return value;
  return Math.round(value / tick) * tick;
}

function nearlyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= Math.max(tolerance, Math.abs(b) * 1e-10);
}

export function normalizeOrderSizing(input: NormalizeOrderSizingInput): NormalizeOrderSizingResult {
  const warnings: string[] = [];
  const spec = resolveOrderSizingSpec(input);
  const fxRateToBase = Math.max(0, toFinite(input.fxRateToBase, 1));
  const rawPrice = Math.max(0, toFinite(input.price, 0));
  const price = roundToTick(rawPrice, spec.priceTick);
  if (!(price > 0)) {
    return { qty: 0, price: 0, notionalBase: 0, spec, sellAll: false, warnings: ["价格低于最小报价精度，无法生成可执行订单"] };
  }
  if (price !== rawPrice) {
    warnings.push(`价格按报价精度归一化：${rawPrice} -> ${price}`);
  }

  const holdingQty = Math.max(0, toFinite(input.holdingQty, 0));
  const notionalBase = Math.max(0, toFinite(input.notionalBase, 0));
  let rawQty = Math.max(0, toFinite(input.qty, 0));
  if (!(rawQty > 0) && notionalBase > 0 && fxRateToBase > 0) {
    rawQty = notionalBase / fxRateToBase / price;
  }

  const sellAllRequested = input.side === "SELL" && holdingQty > 0 && (
    input.sellAll === true
    || nearlyEqual(rawQty, holdingQty, Math.max(spec.qtyStep, 0.000001))
    || (rawQty > holdingQty && rawQty <= holdingQty + Math.max(spec.qtyStep, 0.000001))
  );

  let qty = sellAllRequested ? holdingQty : floorToStep(rawQty, spec.qtyStep);
  if (input.side === "SELL" && holdingQty > 0 && qty > holdingQty) {
    qty = holdingQty;
  }

  if (!sellAllRequested && rawQty > 0 && qty !== rawQty) {
    warnings.push(`数量按下单步长向下取整：${rawQty} -> ${qty}`);
  }

  const normalizedNotionalBase = qty * price * (fxRateToBase > 0 ? fxRateToBase : 1);
  if (qty > 0 && qty < spec.minQty) {
    warnings.push(`数量 ${qty} 低于最小下单数量 ${spec.minQty}`);
    qty = 0;
  }
  if (qty > 0 && spec.minNotionalBase > 0 && normalizedNotionalBase + 1e-9 < spec.minNotionalBase) {
    warnings.push(`订单金额 ${normalizedNotionalBase.toFixed(2)} 低于最小成交额 ${spec.minNotionalBase.toFixed(2)}`);
    qty = 0;
  }

  return {
    qty,
    price,
    notionalBase: qty * price * (fxRateToBase > 0 ? fxRateToBase : 1),
    spec,
    sellAll: sellAllRequested,
    warnings,
  };
}
