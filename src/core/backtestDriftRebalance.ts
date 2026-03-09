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
  /** Historical close series per symbol. All series must share the same dates. */
  seriesBySymbol: Record<string, PriceBar[]>;

  /** Static target weights. Sum may be < 1 (cash left) or > 1 (normalized by rebalanceCore). */
  targetWeights?: Record<string, number>;

  /** Optional daily target-weight timeline keyed by decision date. */
  targetWeightsByDate?: Record<string, Record<string, number>>;

  /** Starting state. If both holdings and cash are empty, initialEquity is used as cash. */
  initialHoldings?: Record<string, number>;
  initialCash?: number;
  initialEquity?: number;

  /** Rebalance constraints. */
  constraints?: RebalanceCoreConstraints;

  /** Trigger policy. lastRebalanceAt/now are managed by the simulator. */
  policy?: Omit<RebalanceTriggerPolicy, "lastRebalanceAt" | "now">;

  /** When starting from cash-only, buy into day-0 target weights. Default: true. */
  bootstrapToTarget?: boolean;

  /** When enabled, include before/after portfolio weight snapshots on each event. */
  includeEventStates?: boolean;

  /** When enabled, include per-day drift/trigger decisions. Default: true. */
  includeTimeline?: boolean;

  execution?: {
    timing?: "t_plus_1_close";
    feeRateBps?: number;
    feeRatePct?: number;
    slippageBps?: number;
  };
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
  signalDate?: string;
  executionTiming?: "t_plus_1_close";
  trigger: RebalanceTriggerDecision;
  orders: SuggestedOrder[];
  executed: SuggestedOrder[];
  turnoverNotional: number;
  feeNotional: number;
  before?: PortfolioWeightsSnapshotV0;
  after?: PortfolioWeightsSnapshotV0;
};

export type DriftRebalanceBacktestTimelinePointV0 = {
  date: string;
  trigger: RebalanceTriggerDecision;
  topAbsDriftsPct01: Array<{ symbol: string; absDriftPct01: number; deltaNotional: number }>;
};

export type DriftRebalanceBacktestResult = {
  schemaVersion: 1;
  dates: string[];
  equity: number[];
  dailyReturns: number[];
  metrics: BacktestMetrics;
  summary: {
    initialEquityAbs: number;
    finalEquityAbs: number;
    rebalanceCount: number;
    turnoverNotional: number;
    totalFeesAbs: number;
  };
  events: DriftRebalanceBacktestEvent[];
  warnings: string[];
  timeline?: DriftRebalanceBacktestTimelinePointV0[];
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
  const dates = ref.map((bar) => String(bar.date));

  for (const sym of symbols.slice(1)) {
    const series = seriesBySymbol[sym] || [];
    if (series.length !== ref.length) {
      throw new Error(`series length mismatch: ${sym} expected=${ref.length} got=${series.length}`);
    }
    assertValidSeriesDates(series);
    for (let i = 0; i < series.length; i += 1) {
      if (String(series[i].date) !== dates[i]) {
        throw new Error(`series date mismatch: ${sym} at i=${i} expected=${dates[i]} got=${String(series[i].date)}`);
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
  let value = Math.max(0, toFiniteNumber(cash, 0));
  for (const [sym, qtyRaw] of Object.entries(holdings || {})) {
    const qty = toFiniteNumber(qtyRaw, 0);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const px = prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      warnings.push(`warning: missing price for holding ${sym}; excluded from valuation`);
      continue;
    }
    const add = qty * px;
    if (Number.isFinite(add)) value += add;
  }
  return value;
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
    const positionValue = qty * px;
    if (!Number.isFinite(positionValue)) continue;
    valuesBySymbol[sym] = positionValue;
    equityAbs += positionValue;
  }

  const denom = equityAbs > 0 ? equityAbs : 1;
  const weightsBySymbolPct01: Record<string, number> = {};
  for (const [sym, positionValue] of Object.entries(valuesBySymbol)) {
    weightsBySymbolPct01[sym] = positionValue / denom;
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
  feeRateBps: number;
  slippageBps: number;
  warnings: string[];
}): {
  holdings: Record<string, number>;
  cash: number;
  executed: SuggestedOrder[];
  turnoverNotional: number;
  feeNotional: number;
} {
  const holdings = cloneHoldings(opts.holdings);
  let cash = Math.max(0, toFiniteNumber(opts.cash, 0));

  const executed: SuggestedOrder[] = [];
  let turnoverNotional = 0;
  let feeNotional = 0;
  const feeRate = Math.max(0, toFiniteNumber(opts.feeRateBps, 0) / 10000);
  const slippageRate = Math.max(0, toFiniteNumber(opts.slippageBps, 0) / 10000);

  for (const order of opts.orders || []) {
    const sym = String(order.symbol || "").trim();
    if (!sym) continue;

    const px = opts.prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      opts.warnings.push(`warning: cannot execute ${order.side} ${sym}: missing/invalid price`);
      continue;
    }

    const notional = toFiniteNumber(order.notional, 0);
    if (!(Number.isFinite(notional) && notional > 0)) continue;

    if (order.side === "SELL") {
      const held = toFiniteNumber(holdings[sym], 0);
      const executionPrice = px * (1 - slippageRate);
      if (!(Number.isFinite(executionPrice) && executionPrice > 0)) continue;
      const maxSellNotional = Math.max(0, held) * executionPrice;
      const actualNotional = Math.min(notional, maxSellNotional);
      if (!(actualNotional > 0)) continue;

      const qty = actualNotional / executionPrice;
      const fee = actualNotional * feeRate;
      holdings[sym] = held - qty;
      cash += actualNotional - fee;
      turnoverNotional += actualNotional;
      feeNotional += fee;

      executed.push({ ...order, notional: actualNotional });
      continue;
    }

    if (order.side === "BUY") {
      const executionPrice = px * (1 + slippageRate);
      if (!(Number.isFinite(executionPrice) && executionPrice > 0)) continue;
      const maxBuyNotionalByCash = cash / (1 + feeRate);
      const actualNotional = Math.min(notional, maxBuyNotionalByCash);
      if (!(actualNotional > 0)) continue;

      const fee = actualNotional * feeRate;
      const qty = actualNotional / executionPrice;
      holdings[sym] = toFiniteNumber(holdings[sym], 0) + qty;
      cash -= actualNotional + fee;
      turnoverNotional += actualNotional;
      feeNotional += fee;

      executed.push({ ...order, notional: actualNotional });
      continue;
    }
  }

  if (cash < 0 && cash > -1e-9) cash = 0;

  return { holdings, cash, executed, turnoverNotional, feeNotional };
}

function normalizeExecutionConfig(
  input: DriftRebalanceBacktestRequest["execution"] | undefined,
): { timing: "t_plus_1_close"; feeRateBps: number; slippageBps: number } {
  if (input?.timing && input.timing !== "t_plus_1_close") {
    throw new Error(`unsupported execution timing: ${String(input.timing)}`);
  }
  const feeRateBpsRaw = Number.isFinite(Number(input?.feeRateBps))
    ? Number(input?.feeRateBps)
    : (Number.isFinite(Number(input?.feeRatePct)) ? Number(input?.feeRatePct) * 10000 : 0);
  return {
    timing: "t_plus_1_close",
    feeRateBps: Math.max(0, toFiniteNumber(feeRateBpsRaw, 0)),
    slippageBps: Math.max(0, toFiniteNumber(input?.slippageBps, 0)),
  };
}

function computeTopAbsDriftsPct01(args: {
  deltas: Record<string, number>;
  equity: number;
  topN: number;
}): Array<{ symbol: string; absDriftPct01: number; deltaNotional: number }> {
  const equity = Number.isFinite(args.equity) && args.equity > 0 ? args.equity : 1;

  const list: Array<{ symbol: string; absDriftPct01: number; deltaNotional: number }> = [];
  for (const [sym, deltaRaw] of Object.entries(args.deltas || {})) {
    const deltaNotional = toFiniteNumber(deltaRaw, 0);
    if (!Number.isFinite(deltaNotional) || deltaNotional === 0) continue;

    const absDriftPct01 = Math.abs(deltaNotional) / equity;
    if (!Number.isFinite(absDriftPct01) || absDriftPct01 <= 0) continue;

    list.push({ symbol: sym, absDriftPct01, deltaNotional });
  }

  list.sort((a, b) => b.absDriftPct01 - a.absDriftPct01 || a.symbol.localeCompare(b.symbol));
  return list.slice(0, Math.max(0, Math.floor(args.topN)));
}

function normalizeWeightMap(weights: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [symbolRaw, weightRaw] of Object.entries(weights || {})) {
    const symbol = String(symbolRaw || "").trim();
    const weight = toFiniteNumber(weightRaw, 0);
    if (!symbol || !(weight > 0)) continue;
    out[symbol] = weight;
  }
  return out;
}

function resolveTargetWeightsForDate(req: DriftRebalanceBacktestRequest, date: string): Record<string, number> {
  if (req.targetWeightsByDate && Object.prototype.hasOwnProperty.call(req.targetWeightsByDate, date)) {
    return normalizeWeightMap(req.targetWeightsByDate[date]);
  }
  return normalizeWeightMap(req.targetWeights);
}

function normalizeConstraintCap(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number.POSITIVE_INFINITY;
  return Math.max(0, num);
}

function buildRuntimeConstraintsForEquity(
  constraints: DriftRebalanceBacktestRequest["constraints"],
  equity: number,
): DriftRebalanceBacktestRequest["constraints"] {
  if (!constraints) return undefined;

  const hasNavCap = Number.isFinite(Number(constraints.maxOrderPctOfNav)) && Number(constraints.maxOrderPctOfNav) > 0;
  if (!hasNavCap) return constraints;

  const navCapAbs = Math.max(0, equity) * Number(constraints.maxOrderPctOfNav);
  const existingMaxIn = normalizeConstraintCap(constraints.maxIn);
  const existingMaxOut = normalizeConstraintCap(constraints.maxOut);

  return {
    ...constraints,
    maxIn: Math.min(existingMaxIn, navCapAbs),
    maxOut: Math.min(existingMaxOut, navCapAbs),
  };
}

export function backtestDriftRebalance(req: DriftRebalanceBacktestRequest): DriftRebalanceBacktestResult {
  const warnings: string[] = [];

  function appendUniqueWarnings(more: string[] | undefined) {
    if (!more?.length) return;
    for (const warning of more) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }

  const { dates } = assertAlignedSeries(req.seriesBySymbol);

  const policy = req.policy || {};
  const bootstrapToTarget = req.bootstrapToTarget !== false;
  const includeEventStates = req.includeEventStates === true;
  const includeTimeline = req.includeTimeline !== false;
  const execution = normalizeExecutionConfig(req.execution);

  let holdings = cloneHoldings(req.initialHoldings || {});
  let cash = Math.max(0, toFiniteNumber(req.initialCash, 0));

  if (!Object.keys(holdings).length && cash <= 0) {
    cash = Math.max(0, toFiniteNumber(req.initialEquity, 10000));
  }

  const events: DriftRebalanceBacktestEvent[] = [];
  const timeline: DriftRebalanceBacktestTimelinePointV0[] = [];

  const prices0 = buildPricesAtIndex(req.seriesBySymbol, 0, warnings);
  let equity0 = portfolioValueAbs(holdings, cash, prices0, warnings);
  if (!(Number.isFinite(equity0) && equity0 > 0)) {
    throw new Error("initial equity must be > 0 (check initialCash/holdings and day-0 prices)");
  }

  const initialState = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: prices0, warnings }) : null;
  let lastRebalanceAt = "";

  if (bootstrapToTarget && !Object.keys(req.initialHoldings || {}).length) {
    const initialTargetWeights = resolveTargetWeightsForDate(req, dates[0]);
    if (Object.keys(initialTargetWeights).length > 0) {
      const bootstrapConstraints = buildRuntimeConstraintsForEquity(req.constraints, equity0);
      const res = rebalanceCore({
        account: { cash: equity0 },
        holdings: {},
        prices: prices0,
        targetWeights: initialTargetWeights,
        constraints: bootstrapConstraints,
        policy: {
          thresholdPct: 0,
          minTradeNotional: 0,
          cooldownSeconds: 0,
        },
      });

      appendUniqueWarnings(res.warnings);

      if (res.orders.length > 0) {
        const before = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: prices0, warnings }) : undefined;
        const ex = executeOrders({
          holdings: {},
          cash: equity0,
          prices: prices0,
          orders: res.orders,
          feeRateBps: execution.feeRateBps,
          slippageBps: execution.slippageBps,
          warnings,
        });
        const after = includeEventStates ? computeWeightsSnapshot({ holdings: ex.holdings, cash: ex.cash, prices: prices0, warnings }) : undefined;

        holdings = ex.holdings;
        cash = ex.cash;
        equity0 = portfolioValueAbs(holdings, cash, prices0, warnings);

        events.push({
          date: dates[0],
          signalDate: dates[0],
          executionTiming: execution.timing,
          kind: "init",
          trigger: res.trigger,
          orders: res.orders,
          executed: ex.executed,
          turnoverNotional: ex.turnoverNotional,
          feeNotional: ex.feeNotional,
          before,
          after,
        });

        lastRebalanceAt = isoToIsoDateTime(dates[0]);
      }
    }
  }

  const equityAbsByDay: number[] = [];
  let turnoverNotional = events.reduce((sum, event) => sum + event.turnoverNotional, 0);
  let totalFeesAbs = events.reduce((sum, event) => sum + event.feeNotional, 0);
  let rebalanceCount = 0;
  let pendingFill:
    | {
        signalDate: string;
        trigger: RebalanceTriggerDecision;
        orders: SuggestedOrder[];
      }
    | undefined;

  for (let i = 0; i < dates.length; i += 1) {
    const prices = buildPricesAtIndex(req.seriesBySymbol, i, warnings);
    const now = isoToIsoDateTime(dates[i]);

    if (pendingFill?.orders?.length) {
      const before = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices, warnings }) : undefined;
      const ex = executeOrders({
        holdings,
        cash,
        prices,
        orders: pendingFill.orders,
        feeRateBps: execution.feeRateBps,
        slippageBps: execution.slippageBps,
        warnings,
      });
      const after = includeEventStates ? computeWeightsSnapshot({ holdings: ex.holdings, cash: ex.cash, prices, warnings }) : undefined;

      holdings = ex.holdings;
      cash = ex.cash;
      turnoverNotional += ex.turnoverNotional;
      totalFeesAbs += ex.feeNotional;
      rebalanceCount += 1;

      events.push({
        date: dates[i],
        signalDate: pendingFill.signalDate,
        executionTiming: execution.timing,
        kind: "rebalance",
        trigger: pendingFill.trigger,
        orders: pendingFill.orders,
        executed: ex.executed,
        turnoverNotional: ex.turnoverNotional,
        feeNotional: ex.feeNotional,
        before,
        after,
      });

      lastRebalanceAt = now;
      pendingFill = undefined;
    }

    const equity = portfolioValueAbs(holdings, cash, prices, warnings);
    equityAbsByDay.push(equity);

    const targetWeights = resolveTargetWeightsForDate(req, dates[i]);
    const runtimeConstraints = buildRuntimeConstraintsForEquity(req.constraints, equity);
    const res = rebalanceCore({
      account: { cash },
      holdings,
      prices,
      targetWeights,
      constraints: runtimeConstraints,
      policy: {
        thresholdPct: policy.thresholdPct,
        minTradeNotional: policy.minTradeNotional,
        cooldownSeconds: policy.cooldownSeconds,
        lastRebalanceAt,
        now,
      },
    });

    appendUniqueWarnings(res.warnings);

    if (includeTimeline) {
      const deltas: Record<string, number> = (res as { explain?: { deltas?: Record<string, number>; equity?: number } }).explain?.deltas ?? {};
      const explainEquity = (res as { explain?: { equity?: number } }).explain?.equity;
      const driftEquity = toFiniteNumber(explainEquity, res.trigger.stats.equity);
      timeline.push({
        date: dates[i],
        trigger: res.trigger,
        topAbsDriftsPct01: computeTopAbsDriftsPct01({ deltas, equity: driftEquity, topN: 5 }),
      });
    }

    if (res.trigger.shouldRebalance) {
      if (i >= dates.length - 1) {
        warnings.push(`warning: rebalance signal on ${dates[i]} skipped because no next bar for T+1 execution`);
      } else {
        pendingFill = {
          signalDate: dates[i],
          trigger: res.trigger,
          orders: res.orders,
        };
      }
    }
  }

  if (pendingFill?.orders?.length) {
    warnings.push(`warning: pending rebalance signal on ${pendingFill.signalDate} was not executed due to missing next bar`);
  }

  const dailyReturns: number[] = [];
  for (let i = 0; i < equityAbsByDay.length - 1; i += 1) {
    const prev = equityAbsByDay[i];
    const next = equityAbsByDay[i + 1];
    if (!(Number.isFinite(prev) && prev > 0 && Number.isFinite(next) && next > 0)) {
      dailyReturns.push(0);
      continue;
    }
    const ret = next / prev - 1;
    dailyReturns.push(Number.isFinite(ret) ? ret : 0);
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
      totalFeesAbs,
    },
    events,
    warnings,
    timeline: includeTimeline ? timeline : undefined,
    states: includeEventStates && initialState && finalState ? { initial: initialState, final: finalState } : undefined,
  };
}
