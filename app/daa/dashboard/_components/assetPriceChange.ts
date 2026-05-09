import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

type AssetPriceChange = {
  change: number;
  changePct: number;
  direction: "up" | "down" | "flat";
  source: "sparkline" | "live";
};

function toFinitePrice(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function fromSparkline(sparkData: number[] | null | undefined): AssetPriceChange | null {
  const prices = (sparkData || []).map(toFinitePrice).filter((value): value is number => value != null);
  if (prices.length < 2) return null;
  const prev = prices[prices.length - 2];
  const last = prices[prices.length - 1];
  const change = last - prev;
  return {
    change,
    changePct: prev > 0 ? (change / prev) * 100 : 0,
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
    source: "sparkline",
  };
}

function fromLiveDelta(row: AssetUniverseView): AssetPriceChange | null {
  const liveDelta = Number((row as Record<string, unknown>).priceDelta);
  if (!Number.isFinite(liveDelta) || liveDelta === 0) return null;
  const lastPrice = toFinitePrice(row.lastPrice);
  if (lastPrice == null) return null;
  const prevPrice = lastPrice - liveDelta;
  if (!(prevPrice > 0)) return null;
  return {
    change: liveDelta,
    changePct: (liveDelta / prevPrice) * 100,
    direction: liveDelta > 0 ? "up" : "down",
    source: "live",
  };
}

export function deriveAssetPriceChange(
  row: AssetUniverseView,
  sparkData?: number[] | null,
): AssetPriceChange | null {
  return fromLiveDelta(row) ?? fromSparkline(sparkData);
}
