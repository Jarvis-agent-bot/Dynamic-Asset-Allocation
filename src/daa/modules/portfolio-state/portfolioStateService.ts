import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";

import type { PortfolioDataHealth, PortfolioPriceStatus, PortfolioState } from "./portfolioStateTypes";

type PortfolioStateSourceAsset = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  holdingQty: number;
  holdingPrice: number;
  lastPrice: number;
  priceStatus?: PortfolioPriceStatus;
  valuationBase: number | null;
  costBasisInBase: number | null;
  unrealizedPnlPct: number | null;
  actualWeightPct: number;
  targetWeightPct: number;
  targetWeightHint: number;
  gapPct: number | null;
  fxMissing: boolean;
};

type PortfolioStateSource = {
  baseCurrency: string;
  account: {
    cash?: number | null;
    totalEquity?: number | null;
  };
  assetUniverse: PortfolioStateSourceAsset[];
};

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildDataHealth(bootstrap: PortfolioStateSource): PortfolioDataHealth {
  const staleAssetKeys: string[] = [];
  const missingAssetKeys: string[] = [];
  const fxMissingAssetKeys: string[] = [];

  for (const row of bootstrap.assetUniverse) {
    if (row.priceStatus === "stale") staleAssetKeys.push(row.assetKey);
    if (row.priceStatus === "missing" || row.priceStatus === "unsupported") missingAssetKeys.push(row.assetKey);
    if (row.fxMissing) fxMissingAssetKeys.push(row.assetKey);
  }

  const status = missingAssetKeys.length || fxMissingAssetKeys.length
    ? "missing"
    : (staleAssetKeys.length ? "stale" : "ok");
  const message = status === "ok"
    ? null
    : [
      missingAssetKeys.length ? `缺少价格 ${missingAssetKeys.length} 项` : "",
      fxMissingAssetKeys.length ? `缺少 FX ${fxMissingAssetKeys.length} 项` : "",
      staleAssetKeys.length ? `价格过期 ${staleAssetKeys.length} 项` : "",
    ].filter(Boolean).join("；");

  return { status, staleAssetKeys, missingAssetKeys, fxMissingAssetKeys, message };
}

export function buildPortfolioState(bootstrap: PortfolioStateSource): PortfolioState {
  const positions = bootstrap.assetUniverse.map((row) => {
    const symbol = String(row.symbol || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const market = String(row.market || "US").trim().toUpperCase() || "US";
    const assetKey = String(row.assetKey || `${market}::${symbol}`).trim().toUpperCase();
    const targetWeightPct = toFiniteNumber(row.targetWeightPct, toFiniteNumber(row.targetWeightHint, 0) * 100);
    const driftPct = row.gapPct == null ? null : toFiniteNumber(row.gapPct, 0);
    const actualWeightPct = toFiniteNumber(row.actualWeightPct, driftPct == null ? 0 : targetWeightPct + driftPct);
    return {
      assetKey,
      symbol,
      currency: String(row.currency || "USD").trim().toUpperCase() || "USD",
      holdingQty: toFiniteNumber(row.holdingQty, 0),
      price: toFiniteNumber(row.lastPrice, 0) > 0 ? toFiniteNumber(row.lastPrice, 0) : toFiniteNumber(row.holdingPrice, 0),
      priceStatus: row.priceStatus ?? "fresh",
      valuationBase: row.valuationBase == null ? null : toFiniteNumber(row.valuationBase, 0),
      costBasisInBase: row.costBasisInBase == null ? null : toFiniteNumber(row.costBasisInBase, 0),
      unrealizedPnlPct: row.unrealizedPnlPct == null ? null : toFiniteNumber(row.unrealizedPnlPct, 0),
      actualWeightPct,
      targetWeightPct,
      driftPct,
      fxMissing: row.fxMissing === true,
    };
  });
  const holdingRows = positions.filter((row) => row.holdingQty > 0 && (row.valuationBase || 0) > 0);
  const investedValueBase = holdingRows.reduce((sum, row) => sum + (row.valuationBase || 0), 0);
  const maxWeightPct = holdingRows.reduce((max, row) => Math.max(max, row.actualWeightPct || 0), 0);
  const maxAbsDriftPct = positions.reduce((max, row) => Math.max(max, Math.abs(row.driftPct || 0)), 0);

  return {
    asOf: new Date().toISOString(),
    accountId: getDaaAccountScopeId(),
    baseCurrency: bootstrap.baseCurrency,
    navBase: Math.max(0, bootstrap.account.totalEquity ?? 0),
    cashBase: Math.max(0, bootstrap.account.cash ?? 0),
    positions,
    exposures: {
      holdingCount: holdingRows.length,
      maxWeightPct,
      maxAbsDriftPct,
      investedValueBase,
    },
    dataHealth: buildDataHealth(bootstrap),
  };
}
