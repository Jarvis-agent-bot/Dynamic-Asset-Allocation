import type { BacktestMetrics, PriceBar } from "./domain";
import { cumulativeProduct } from "./math";
import { computeMetrics } from "./metrics";
import {
  rebalanceCore,
  type RebalanceCoreConstraints,
  type RebalanceTriggerPolicy,
  type SuggestedOrder,
  type RebalanceTriggerDecision,
} from "./rebalanceCore";
import { assertValidSeriesDates } from "./seriesContracts";

export type DriftRebalanceBacktestRequest = {
  /**
   * Historical close series per symbol. v0 requires all series share the same dates.
   *
   * Example:
   * { AAA: [{date:"2026-01-01", close: 10}, ...], BBB: [...] }
   */
  seriesBySymbol: Record<string, PriceBar[]>;

  /** Target weights, 0..1. Sum may be < 1 (remainder is cash) or > 1 (normalized). */
  targetWeights: Record<string, number>;

  /** Starting state. If both holdings and cash are empty, initialEquity is used as cash. */
  initialHoldings?: Record<string, number>;
  initialCash?: number;
  initialEquity?: number;

  /** Rebalance constraints (maxIn/maxOut/minNotional, etc). */
  constraints?: RebalanceCoreConstraints;

  /** Trigger policy. lastRebalanceAt/now are managed by the simulator. */
  policy?: Omit<RebalanceTriggerPolicy, "lastRebalanceAt" | "now">;

  /** When starting from cash-only, buy into target weights on day 0. Default: true. */
  bootstrapToTarget?: boolean;

  /** When enabled, include before/after portfolio weight snapshots on each event (for UI "plan diff"). */
  includeEventStates?: boolean;
};

export type PortfolioWeightsSnapshotV0 = {
  equityAbs: number;
  cashAbs: number;
  cashPct01: number;
  weightsBySymbolPct01: Record<string, number>;
};

export type DriftRebalanceBacktestEvent = {
  date: string;
  kind: "init" | "rebalance";
  trigger: RebalanceTriggerDecision;
  orders: SuggestedOrder[];
  executed: SuggestedOrder[];
  turnoverNotional: number;

  // Optional: used by UI to render a before/after weight diff for each planned action.
  before?: PortfolioWeightsSnapshotV0;
  after?: PortfolioWeightsSnapshotV0;
};

export type DriftRebalanceBacktestResult = {
  schemaVersion: 1;

  /** Dates aligned with dailyReturns/equity (i.e. transitions day[i-1] -> day[i]). */
  dates: string[];
  equity: number[];
  dailyReturns: number[];
  metrics: BacktestMetrics;

  summary: {
    initialEquityAbs: number;
    finalEquityAbs: number;
    rebalanceCount: number;
    turnoverNotional: number;
  };

  events: DriftRebalanceBacktestEvent[];
  warnings: string[];

  // Optional: overall before/after snapshots (useful for showing a top-level preview diff).
  states?: {
    initial: PortfolioWeightsSnapshotV0;
    final: PortfolioWeightsSnapshotV0;
  };
};

function toFiniteNumber(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function isoToIsoDateTime(isoDate: string): string {
  // Accept YYYY-MM-DD for v0 and anchor to UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return `${isoDate}T00:00:00.000Z`;
  return isoDate;
}

function assertAlignedSeries(seriesBySymbol: Record<string, PriceBar[]>): { symbols: string[]; dates: string[] } {
  const symbols = Object.keys(seriesBySymbol || {}).filter(Boolean).sort();
  if (!symbols.length) throw new Error("seriesBySymbol is required");

  const refSym = symbols[0];
  const ref = seriesBySymbol[refSym] || [];
  if (ref.length < 2) throw new Error(`series too short for ${refSym}`);

  assertValidSeriesDates(ref);
  const dates = ref.map((b) => String(b.date));

  for (const sym of symbols.slice(1)) {
    const s = seriesBySymbol[sym] || [];
    if (s.length !== ref.length) {
      throw new Error(`series length mismatch: ${sym} expected=${ref.length} got=${s.length}`);
    }
    assertValidSeriesDates(s);
    for (let i = 0; i < s.length; i++) {
      if (String(s[i].date) !== dates[i]) {
        throw new Error(`series date mismatch: ${sym} at i=${i} expected=${dates[i]} got=${String(s[i].date)}`);
      }
    }
  }

  return { symbols, dates };
}

function buildPricesAtIndex(seriesBySymbol: Record<string, PriceBar[]>, i: number, warnings: string[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const [sym, series] of Object.entries(seriesBySymbol || {})) {
    const bar = (series || [])[i];
    const close = toFiniteNumber(bar?.close, Number.NaN);
    if (!Number.isFinite(close) || close <= 0) {
      warnings.push(`warning: invalid close for ${sym} at i=${i}; got ${String(bar?.close)}`);
      continue;
    }
    prices[sym] = close;
  }
  return prices;
}

function cloneHoldings(h: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, vRaw] of Object.entries(h || {})) {
    const qty = toFiniteNumber(vRaw, 0);
    if (!k.trim()) continue;
    if (!Number.isFinite(qty)) continue;
    out[k.trim()] = qty;
  }
  return out;
}

function portfolioValueAbs(holdings: Record<string, number>, cash: number, prices: Record<string, number>, warnings: string[]): number {
  let v = Math.max(0, toFiniteNumber(cash, 0));
  for (const [sym, qtyRaw] of Object.entries(holdings || {})) {
    const qty = toFiniteNumber(qtyRaw, 0);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const px = prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      warnings.push(`warning: missing price for holding ${sym}; excluded from valuation`);
      continue;
    }
    const add = qty * px;
    if (Number.isFinite(add)) v += add;
  }
  return v;
}
function computeWeightsSnapshot(opts: {
  holdings: Record<string, number>;
  cash: number;
  prices: Record<string, number>;
  warnings: string[];
}): PortfolioWeightsSnapshotV0 {
  const cashAbs = Math.max(0, toFiniteNumber(opts.cash, 0));
  const valuesBySymbol: Record<string, number> = {};

  let equityAbs = cashAbs;
  for (const [sym, qtyRaw] of Object.entries(opts.holdings || {})) {
    const qty = toFiniteNumber(qtyRaw, 0);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const px = opts.prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      opts.warnings.push(`warning: missing price for holding ${sym}; excluded from valuation`);
      continue;
    }
    const v = qty * px;
    if (!Number.isFinite(v)) continue;
    valuesBySymbol[sym] = v;
    equityAbs += v;
  }

  const denom = equityAbs > 0 ? equityAbs : 1;
  const weightsBySymbolPct01: Record<string, number> = {};
  for (const [sym, v] of Object.entries(valuesBySymbol)) {
    weightsBySymbolPct01[sym] = v / denom;
  }

  return {
    equityAbs,
    cashAbs,
    cashPct01: cashAbs / denom,
    weightsBySymbolPct01,
  };
}


function executeOrders(opts: {
  holdings: Record<string, number>;
  cash: number;
  prices: Record<string, number>;
  orders: SuggestedOrder[];
  warnings: string[];
}): { holdings: Record<string, number>; cash: number; executed: SuggestedOrder[]; turnoverNotional: number } {
  const holdings = cloneHoldings(opts.holdings);
  let cash = Math.max(0, toFiniteNumber(opts.cash, 0));

  const executed: SuggestedOrder[] = [];
  let turnoverNotional = 0;

  for (const o of opts.orders || []) {
    const sym = String(o.symbol || "").trim();
    if (!sym) continue;

    const px = opts.prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      opts.warnings.push(`warning: cannot execute ${o.side} ${sym}: missing/invalid price`);
      continue;
    }

    const notional = toFiniteNumber(o.notional, 0);
    if (!(Number.isFinite(notional) && notional > 0)) continue;

    if (o.side === "SELL") {
      const held = toFiniteNumber(holdings[sym], 0);
      const maxSellNotional = Math.max(0, held) * px;
      const actualNotional = Math.min(notional, maxSellNotional);
      if (!(actualNotional > 0)) continue;

      const qty = actualNotional / px;
      holdings[sym] = held - qty;
      cash += actualNotional;
      turnoverNotional += actualNotional;

      executed.push({ ...o, notional: actualNotional });
      continue;
    }

    if (o.side === "BUY") {
      const actualNotional = Math.min(notional, cash);
      if (!(actualNotional > 0)) continue;

      const qty = actualNotional / px;
      holdings[sym] = toFiniteNumber(holdings[sym], 0) + qty;
      cash -= actualNotional;
      turnoverNotional += actualNotional;

      executed.push({ ...o, notional: actualNotional });
      continue;
    }
  }

  // Normalize tiny negative cash from floating point.
  if (cash < 0 && cash > -1e-9) cash = 0;

  return { holdings, cash, executed, turnoverNotional };
}

export function backtestDriftRebalance(req: DriftRebalanceBacktestRequest): DriftRebalanceBacktestResult {
  const warnings: string[] = [];

  // backtestDriftRebalance is the SoT for the auto-plan UI. Surface core warnings
  // (e.g. minTradeNotional/maxOut blockers) so the UI/markdown plan can show them.
  function appendUniqueWarnings(more: string[] | undefined) {
    if (!more?.length) return;
    for (const w of more) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  const { dates } = assertAlignedSeries(req.seriesBySymbol);

  const constraints = req.constraints;
  const policy = req.policy || {};
  const bootstrapToTarget = req.bootstrapToTarget !== false;
  const includeEventStates = req.includeEventStates === true;

  let holdings = cloneHoldings(req.initialHoldings || {});
  let cash = Math.max(0, toFiniteNumber(req.initialCash, 0));

  if (!Object.keys(holdings).length && cash <= 0) {
    cash = Math.max(0, toFiniteNumber(req.initialEquity, 10000));
  }

  const events: DriftRebalanceBacktestEvent[] = [];

  // Establish day-0 prices and equity.
  const prices0 = buildPricesAtIndex(req.seriesBySymbol, 0, warnings);
  let equity0 = portfolioValueAbs(holdings, cash, prices0, warnings);
  if (!(Number.isFinite(equity0) && equity0 > 0)) {
    throw new Error("initial equity must be > 0 (check initialCash/holdings and day-0 prices)");
  }

  const initialState = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: prices0, warnings }) : null;

  let lastRebalanceAt = "";

  // Optional bootstrap into the target weights when starting from cash-only.
  if (bootstrapToTarget && !Object.keys(req.initialHoldings || {}).length) {
    const res = rebalanceCore({
      account: { cash: equity0 },
      holdings: {},
      prices: prices0,
      targetWeights: req.targetWeights,
      constraints,
      policy: {
        thresholdPct: 0,
        minTradeNotional: 0,
        cooldownSeconds: 0,
      },
    });

    appendUniqueWarnings(res.warnings);

    const before = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: prices0, warnings }) : undefined;

    const ex = executeOrders({ holdings: {}, cash: equity0, prices: prices0, orders: res.orders, warnings });
    const after = includeEventStates ? computeWeightsSnapshot({ holdings: ex.holdings, cash: ex.cash, prices: prices0, warnings }) : undefined;

    holdings = ex.holdings;
    cash = ex.cash;
    equity0 = portfolioValueAbs(holdings, cash, prices0, warnings);

    events.push({
      date: dates[0],
      kind: "init",
      trigger: res.trigger,
      orders: res.orders,
      executed: ex.executed,
      turnoverNotional: ex.turnoverNotional,
      before,
      after,
    });

    lastRebalanceAt = isoToIsoDateTime(dates[0]);
  }

  // Simulate close-to-close equity.
  const equityAbsByDay: number[] = [];

  let turnoverNotional = events.reduce((acc, e) => acc + e.turnoverNotional, 0);
  let rebalanceCount = 0;

  for (let i = 0; i < dates.length; i++) {
    const px = buildPricesAtIndex(req.seriesBySymbol, i, warnings);
    const eq = portfolioValueAbs(holdings, cash, px, warnings);
    equityAbsByDay.push(eq);

    // End: last day has no next-day return.
    if (i === dates.length - 1) break;

    const now = isoToIsoDateTime(dates[i]);

    const res = rebalanceCore({
      account: { cash },
      holdings,
      prices: px,
      targetWeights: req.targetWeights,
      constraints,
      policy: {
        thresholdPct: policy.thresholdPct,
        minTradeNotional: policy.minTradeNotional,
        cooldownSeconds: policy.cooldownSeconds,
        lastRebalanceAt,
        now,
      },
    });

    appendUniqueWarnings(res.warnings);

    if (res.trigger.shouldRebalance) {
      const before = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: px, warnings }) : undefined;
      const ex = executeOrders({ holdings, cash, prices: px, orders: res.orders, warnings });
      const after = includeEventStates ? computeWeightsSnapshot({ holdings: ex.holdings, cash: ex.cash, prices: px, warnings }) : undefined;

      holdings = ex.holdings;
      cash = ex.cash;
      turnoverNotional += ex.turnoverNotional;
      rebalanceCount += 1;

      events.push({
        date: dates[i],
        kind: "rebalance",
        trigger: res.trigger,
        orders: res.orders,
        executed: ex.executed,
        turnoverNotional: ex.turnoverNotional,
        before,
        after,
      });

      lastRebalanceAt = now;
    }
  }

  // Convert equityAbs to daily returns and normalize to 1.
  const dailyReturns: number[] = [];
  for (let i = 0; i < equityAbsByDay.length - 1; i++) {
    const a = equityAbsByDay[i];
    const b = equityAbsByDay[i + 1];
    if (!(Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0)) {
      dailyReturns.push(0);
      continue;
    }
    const r = b / a - 1;
    dailyReturns.push(Number.isFinite(r) ? r : 0);
  }

  const equity = cumulativeProduct(dailyReturns, 1);
  const metrics: BacktestMetrics = computeMetrics(equity, dailyReturns);

  const finalState = (() => {
    if (!includeEventStates) return null;
    const pxLast = buildPricesAtIndex(req.seriesBySymbol, dates.length - 1, warnings);
    return computeWeightsSnapshot({ holdings, cash, prices: pxLast, warnings });
  })();

  return {
    schemaVersion: 1,
    dates: dates.slice(1),
    equity,
    dailyReturns,
    metrics,
    summary: {
      initialEquityAbs: equityAbsByDay[0] ?? 0,
      finalEquityAbs: equityAbsByDay[equityAbsByDay.length - 1] ?? 0,
      rebalanceCount,
      turnoverNotional,
    },
    events,
    warnings,
    states: includeEventStates && initialState && finalState ? { initial: initialState, final: finalState } : undefined,
  };
}
