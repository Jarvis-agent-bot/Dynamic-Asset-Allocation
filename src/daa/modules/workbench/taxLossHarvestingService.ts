import { daaPgPool } from "@/src/daa/pg/daaPg";
import type { WorkbenchBootstrap, RebalanceProposal } from "./workbenchTypes";

// ── Types ──────────────────────────────────────────────────────────────

export type TlhCandidate = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  holdingQty: number;
  costBasis: number;
  currentValue: number;
  unrealizedLoss: number;      // negative number = loss
  unrealizedLossPct: number;   // as percentage of cost basis
  lastPrice: number;
  fxRateToBase: number;
  lossInBase: number;          // loss converted to base currency
  washSaleBlocked: boolean;    // true if within 30-day wash sale window
  washSaleBlockedUntil: string | null;
  harvestable: boolean;        // true if loss is meaningful and not blocked
};

export type TlhScanResult = {
  candidates: TlhCandidate[];
  totalHarvestableBase: number;
  totalBlockedBase: number;
  proposals: RebalanceProposal[];
  scannedAt: string;
};

export type TlhConfig = {
  enabled: boolean;
  minLossPct: number;          // minimum unrealized loss % to consider (default 5%)
  minLossAbsBase: number;      // minimum absolute loss in base currency (default 100)
  washSaleDays: number;        // wash sale lookback window (default 30)
};

const DEFAULT_TLH_CONFIG: TlhConfig = {
  enabled: true,
  minLossPct: 0.05,            // 5%
  minLossAbsBase: 100,         // $100 minimum
  washSaleDays: 30,
};

// ── Wash Sale Detection ────────────────────────────────────────────────

/**
 * Check if a symbol was recently bought within the wash sale window.
 * Looks at trade tickets for BUY orders in the last N days.
 */
async function getWashSaleBlockedSymbols(input: {
  symbols: string[];
  washSaleDays: number;
}): Promise<Map<string, string>> {
  if (input.symbols.length === 0) return new Map();

  const pool = daaPgPool();
  const cutoff = new Date(Date.now() - input.washSaleDays * 24 * 60 * 60 * 1000).toISOString();

  // Check if trade tickets table exists
  try {
    const { rows } = await pool.query(
      `SELECT symbol, MAX(created_at) as last_buy_at
       FROM daa_trade_tickets
       WHERE symbol = ANY($1)
         AND side = 'BUY'
         AND status = 'executed'
         AND created_at >= $2::timestamptz
       GROUP BY symbol`,
      [input.symbols.map((s) => s.toUpperCase()), cutoff],
    );

    const result = new Map<string, string>();
    for (const row of rows) {
      const blockedUntil = new Date(
        Date.parse(row.last_buy_at) + input.washSaleDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      result.set(String(row.symbol).toUpperCase(), blockedUntil);
    }
    return result;
  } catch {
    return new Map();
  }
}

// ── TLH Scanning ───────────────────────────────────────────────────────

/**
 * Scan the portfolio for tax-loss harvesting opportunities.
 */
export async function scanTaxLossHarvestingCandidates(input: {
  bootstrap: WorkbenchBootstrap;
  config?: Partial<TlhConfig>;
}): Promise<TlhScanResult> {
  const config: TlhConfig = { ...DEFAULT_TLH_CONFIG, ...input.config };
  const bootstrap = input.bootstrap;

  // Find positions with unrealized losses
  const holdingRows = bootstrap.assetUniverse.filter((row) => {
    if (!(row.holdingQty > 0)) return false;
    if (!(row.costBasis != null && row.costBasis > 0)) return false;
    const currentPrice = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    if (!(currentPrice > 0)) return false;
    return true;
  });

  const symbols = holdingRows.map((row) => row.symbol);
  const washSaleBlocked = await getWashSaleBlockedSymbols({
    symbols,
    washSaleDays: config.washSaleDays,
  });

  const candidates: TlhCandidate[] = [];

  for (const row of holdingRows) {
    const currentPrice = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
    const costBasis = row.costBasis ?? (row.holdingQty * row.holdingPrice);
    const currentValue = row.holdingQty * currentPrice;
    const unrealizedLoss = currentValue - costBasis; // negative = loss

    if (unrealizedLoss >= 0) continue; // Skip gains

    const unrealizedLossPct = Math.abs(unrealizedLoss) / Math.max(1, costBasis);
    const fxRate = (row.fxRateToBase && row.fxRateToBase > 0) ? row.fxRateToBase : 1;
    const lossInBase = Math.abs(unrealizedLoss) * fxRate;

    // Check minimum thresholds
    if (unrealizedLossPct < config.minLossPct) continue;
    if (lossInBase < config.minLossAbsBase) continue;

    const symbolUpper = row.symbol.toUpperCase();
    const isWashBlocked = washSaleBlocked.has(symbolUpper);
    const blockedUntil = washSaleBlocked.get(symbolUpper) || null;

    candidates.push({
      assetKey: row.assetKey,
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      holdingQty: row.holdingQty,
      costBasis,
      currentValue,
      unrealizedLoss,
      unrealizedLossPct: Number((-unrealizedLossPct * 100).toFixed(2)),
      lastPrice: currentPrice,
      fxRateToBase: fxRate,
      lossInBase: Number(lossInBase.toFixed(2)),
      washSaleBlocked: isWashBlocked,
      washSaleBlockedUntil: blockedUntil,
      harvestable: !isWashBlocked,
    });
  }

  // Sort by loss amount (largest losses first)
  candidates.sort((a, b) => b.lossInBase - a.lossInBase);

  const harvestable = candidates.filter((c) => c.harvestable);
  const blocked = candidates.filter((c) => !c.harvestable);

  // Generate sell proposals for harvestable positions
  const proposals: RebalanceProposal[] = harvestable.map((c) => ({
    assetKey: c.assetKey,
    symbol: c.symbol,
    side: "SELL" as const,
    price: c.lastPrice,
    currency: c.currency,
    fxRateToBase: c.fxRateToBase,
    suggestedQty: c.holdingQty,         // Sell entire position
    suggestedNotional: c.currentValue,
    reason: `税务收割: 浮亏 ${c.unrealizedLossPct.toFixed(1)}%（${c.lossInBase.toFixed(0)} ${bootstrap.baseCurrency}）`,
    selected: false,                     // TLH proposals default to unselected (require manual review)
    hfContribution: null,
    decisionContext: {
      driftReason: `TLH: 卖出以实现 ${c.lossInBase.toFixed(0)} ${bootstrap.baseCurrency} 税损`,
      signalAction: null,
      signalScore: null,
      signalConfidence: null,
      signalConflict: false,
      llmAdjustment: null,
      llmConfidence: null,
      llmRationale: null,
      marketRegime: null,
      marketScope: null,
      marketScopeLabel: null,
      marketIndicatorFlags: [],
      conflictFlags: [],
      finalQtyMultiplier: 1,
    },
  }));

  return {
    candidates,
    totalHarvestableBase: harvestable.reduce((sum, c) => sum + c.lossInBase, 0),
    totalBlockedBase: blocked.reduce((sum, c) => sum + c.lossInBase, 0),
    proposals,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * After a TLH sell is executed, record it so future buys of the same symbol
 * within 30 days will be flagged as wash sales.
 * This is already handled by the trade ticket system (BUY records),
 * so this function just checks if a re-purchase would trigger a wash sale.
 */
export function checkWashSaleRisk(input: {
  symbol: string;
  tlhSellDate: Date;
  proposedBuyDate: Date;
  washSaleDays?: number;
}): { isWashSale: boolean; safeAfter: string } {
  const days = input.washSaleDays ?? 30;
  const sellMs = input.tlhSellDate.getTime();
  const buyMs = input.proposedBuyDate.getTime();
  const windowMs = days * 24 * 60 * 60 * 1000;

  // Wash sale applies 30 days before AND after the sale
  const windowStart = sellMs - windowMs;
  const windowEnd = sellMs + windowMs;

  return {
    isWashSale: buyMs >= windowStart && buyMs <= windowEnd,
    safeAfter: new Date(sellMs + windowMs).toISOString().slice(0, 10),
  };
}
