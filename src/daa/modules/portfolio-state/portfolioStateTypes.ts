export type PortfolioPriceStatus = "fresh" | "stale" | "missing" | "unsupported";

export type PortfolioDataHealth = {
  status: "ok" | "stale" | "missing" | "degraded";
  staleAssetKeys: string[];
  missingAssetKeys: string[];
  fxMissingAssetKeys: string[];
  message: string | null;
};

export type PortfolioPositionState = {
  assetKey: string;
  symbol: string;
  currency: string;
  holdingQty: number;
  price: number;
  priceStatus: PortfolioPriceStatus;
  valuationBase: number | null;
  costBasisInBase: number | null;
  unrealizedPnlPct: number | null;
  actualWeightPct: number;
  targetWeightPct: number;
  driftPct: number | null;
  fxMissing: boolean;
};

export type PortfolioExposureState = {
  holdingCount: number;
  maxWeightPct: number;
  maxAbsDriftPct: number;
  investedValueBase: number;
};

export type PortfolioState = {
  asOf: string;
  accountId: string;
  baseCurrency: string;
  navBase: number;
  cashBase: number;
  positions: PortfolioPositionState[];
  exposures: PortfolioExposureState;
  dataHealth: PortfolioDataHealth;
};
