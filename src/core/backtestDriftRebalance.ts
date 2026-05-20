import type { BacktestMetrics, PriceBar } from "./domain";
import { cumulativeProduct } from "./math";
import { computeMetrics } from "./metrics";
import {
  rebalanceCore,
  type RebalanceCoreConstraints,
  type RebalanceTriggerConfig,
  type SuggestedOrder,
  type RebalanceTriggerDecision,
} from "./rebalanceCore";
import { assertValidSeriesDates } from "./seriesContracts";
import { toFinite } from "./utils/number";

export type DriftRebalanceBacktestRequest = {
  /** 每个资产的历史收盘价；所有序列必须共享同一组估值日期。 */
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

  /** Rebalance trigger config. lastRebalanceAt/now are managed by the simulator. */
  trigger?: Omit<RebalanceTriggerConfig, "lastRebalanceAt" | "now">;

  /** 可选的计划调仓信号日期；传入后只允许这些日期打开新的再平衡信号。 */
  rebalanceDates?: string[];

  /** When starting from cash-only, buy into day-0 target weights. Default: true. */
  bootstrapToTarget?: boolean;

  /** When enabled, include before/after portfolio weight snapshots on each event. */
  includeEventStates?: boolean;

  /** When enabled, include per-day drift/trigger decisions. Default: true. */
  includeTimeline?: boolean;

  /** Optional real-bar calendar; when provided, orders can only execute on these dates per symbol. */
  executableDatesBySymbol?: Record<string, string[]>;

  execution?: {
    timing?: "t_plus_1_close";
    feeRateBps?: number;
    feeRatePct?: number;
    slippageBps?: number;
  };
};

type PortfolioWeightsSnapshot = {
  equityAbs: number;
  cashAbs: number;
  cashPct01: number;
  weightsBySymbolPct01: Record<string, number>;
};

type DriftRebalanceBacktestPortfolioPoint = PortfolioWeightsSnapshot & {
  date: string;
};

type DriftRebalanceBacktestEvent = {
  date: string;
  kind: "init" | "rebalance";
  signalDate?: string;
  executionTiming?: "t_plus_1_close";
  trigger: RebalanceTriggerDecision;
  orders: SuggestedOrder[];
  executed: SuggestedOrder[];
  turnoverNotional: number;
  feeNotional: number;
  before?: PortfolioWeightsSnapshot;
  after?: PortfolioWeightsSnapshot;
};

type DriftRebalanceBacktestTimelinePoint = {
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
  portfolioByDate: DriftRebalanceBacktestPortfolioPoint[];
  timeline?: DriftRebalanceBacktestTimelinePoint[];
  states?: {
    initial: PortfolioWeightsSnapshot;
    final: PortfolioWeightsSnapshot;
  };
};

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
    const close = toFinite(bar?.close, Number.NaN);
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
    const qty = toFinite(vRaw, 0);
    if (!k.trim()) continue;
    if (!Number.isFinite(qty)) continue;
    out[k.trim()] = qty;
  }
  return out;
}

function portfolioValueAbs(holdings: Record<string, number>, cash: number, prices: Record<string, number>, warnings: string[]): number {
  let value = Math.max(0, toFinite(cash, 0));
  for (const [sym, qtyRaw] of Object.entries(holdings || {})) {
    const qty = toFinite(qtyRaw, 0);
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
}): PortfolioWeightsSnapshot {
  const cashAbs = Math.max(0, toFinite(opts.cash, 0));
  const valuesBySymbol: Record<string, number> = {};

  let equityAbs = cashAbs;
  for (const [sym, qtyRaw] of Object.entries(opts.holdings || {})) {
    const qty = toFinite(qtyRaw, 0);
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
  let cash = Math.max(0, toFinite(opts.cash, 0));

  const executed: SuggestedOrder[] = [];
  let turnoverNotional = 0;
  let feeNotional = 0;
  const feeRate = Math.max(0, toFinite(opts.feeRateBps, 0) / 10000);
  const slippageRate = Math.max(0, toFinite(opts.slippageBps, 0) / 10000);

  for (const order of opts.orders || []) {
    const sym = String(order.symbol || "").trim();
    if (!sym) continue;

    const px = opts.prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      opts.warnings.push(`warning: cannot execute ${order.side} ${sym}: missing/invalid price`);
      continue;
    }

    const notional = toFinite(order.notional, 0);
    if (!(Number.isFinite(notional) && notional > 0)) continue;

    if (order.side === "SELL") {
      const held = toFinite(holdings[sym], 0);
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
      holdings[sym] = toFinite(holdings[sym], 0) + qty;
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

function buildExecutableDateSetsBySymbol(
  input: DriftRebalanceBacktestRequest["executableDatesBySymbol"] | undefined,
): Record<string, Set<string>> | null {
  const entries = Object.entries(input || {})
    .map(([symbolRaw, datesRaw]) => {
      const symbol = String(symbolRaw || "").trim().toUpperCase();
      const dates = Array.isArray(datesRaw)
        ? datesRaw.map((date) => String(date || "").trim()).filter(Boolean)
        : [];
      return symbol ? [symbol, new Set(dates)] as const : null;
    })
    .filter((item): item is readonly [string, Set<string>] => Boolean(item));

  if (!entries.length) return null;
  return Object.fromEntries(entries);
}

function buildRebalanceDateSet(input: DriftRebalanceBacktestRequest["rebalanceDates"] | undefined): Set<string> | null {
  if (!Array.isArray(input)) return null;
  return new Set(input.map((date) => String(date || "").trim()).filter(Boolean));
}

function partitionOrdersByExecutableDate(input: {
  date: string;
  orders: SuggestedOrder[];
  executableDateSetsBySymbol: Record<string, Set<string>> | null;
}): { executableOrders: SuggestedOrder[]; deferredOrders: SuggestedOrder[] } {
  if (!input.executableDateSetsBySymbol) {
    return {
      executableOrders: [...(input.orders || [])],
      deferredOrders: [],
    };
  }

  const executableOrders: SuggestedOrder[] = [];
  const deferredOrders: SuggestedOrder[] = [];
  for (const order of input.orders || []) {
    const symbol = String(order.symbol || "").trim().toUpperCase();
    if (!symbol) {
      executableOrders.push(order);
      continue;
    }
    const allowedDates = input.executableDateSetsBySymbol[symbol];
    if (allowedDates?.has(input.date)) {
      executableOrders.push(order);
    } else {
      deferredOrders.push(order);
    }
  }

  return { executableOrders, deferredOrders };
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
    feeRateBps: Math.max(0, toFinite(feeRateBpsRaw, 0)),
    slippageBps: Math.max(0, toFinite(input?.slippageBps, 0)),
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
    const deltaNotional = toFinite(deltaRaw, 0);
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
    const weight = toFinite(weightRaw, 0);
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

  const trigger = req.trigger || {};
  const bootstrapToTarget = req.bootstrapToTarget !== false;
  const includeEventStates = req.includeEventStates === true;
  const includeTimeline = req.includeTimeline !== false;
  const execution = normalizeExecutionConfig(req.execution);
  const rebalanceDateSet = buildRebalanceDateSet(req.rebalanceDates);

  let holdings = cloneHoldings(req.initialHoldings || {});
  let cash = Math.max(0, toFinite(req.initialCash, 0));

  if (!Object.keys(holdings).length && cash <= 0) {
    cash = Math.max(0, toFinite(req.initialEquity, 10000));
  }

  const events: DriftRebalanceBacktestEvent[] = [];
  const timeline: DriftRebalanceBacktestTimelinePoint[] = [];
  const portfolioByDate: DriftRebalanceBacktestPortfolioPoint[] = [];

  const prices0 = buildPricesAtIndex(req.seriesBySymbol, 0, warnings);
  let equity0 = portfolioValueAbs(holdings, cash, prices0, warnings);
  const fundedEquityAbs = equity0;
  if (!(Number.isFinite(equity0) && equity0 > 0)) {
    throw new Error("initial equity must be > 0 (check initialCash/holdings and day-0 prices)");
  }

  const initialState = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: prices0, warnings }) : null;
  const executableDateSetsBySymbol = buildExecutableDateSetsBySymbol(req.executableDatesBySymbol);
  let lastRebalanceAt = "";
  let pendingFill:
    | {
        signalDate: string;
        trigger: RebalanceTriggerDecision;
        orders: SuggestedOrder[];
      }
    | undefined;

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
        trigger: {
          driftThresholdPct: 0,
          minOrderNotional: 0,
          minRebalanceIntervalSeconds: 0,
        },
      });

      appendUniqueWarnings(res.warnings);

      if (res.orders.length > 0) {
        const { executableOrders, deferredOrders } = partitionOrdersByExecutableDate({
          date: dates[0],
          orders: res.orders,
          executableDateSetsBySymbol,
        });

        if (executableOrders.length > 0) {
          const before = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices: prices0, warnings }) : undefined;
          const ex = executeOrders({
            holdings: {},
            cash: equity0,
            prices: prices0,
            orders: executableOrders,
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
            orders: executableOrders,
            executed: ex.executed,
            turnoverNotional: ex.turnoverNotional,
            feeNotional: ex.feeNotional,
            before,
            after,
          });

          lastRebalanceAt = isoToIsoDateTime(dates[0]);
        }

        if (deferredOrders.length > 0) {
          pendingFill = {
            signalDate: dates[0],
            trigger: res.trigger,
            orders: deferredOrders,
          };
        }
      }
    }
  }

  const equityAbsByDay: number[] = [];
  let turnoverNotional = events.reduce((sum, event) => sum + event.turnoverNotional, 0);
  let totalFeesAbs = events.reduce((sum, event) => sum + event.feeNotional, 0);
  let rebalanceCount = 0;

  for (let i = 0; i < dates.length; i += 1) {
    const prices = buildPricesAtIndex(req.seriesBySymbol, i, warnings);
    const now = isoToIsoDateTime(dates[i]);

    if (pendingFill?.orders?.length) {
      const { executableOrders, deferredOrders } = partitionOrdersByExecutableDate({
        date: dates[i],
        orders: pendingFill.orders,
        executableDateSetsBySymbol,
      });

      if (executableOrders.length > 0) {
        const before = includeEventStates ? computeWeightsSnapshot({ holdings, cash, prices, warnings }) : undefined;
        const ex = executeOrders({
          holdings,
          cash,
          prices,
          orders: executableOrders,
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
          orders: executableOrders,
          executed: ex.executed,
          turnoverNotional: ex.turnoverNotional,
          feeNotional: ex.feeNotional,
          before,
          after,
        });

        lastRebalanceAt = now;
      }

      pendingFill = deferredOrders.length > 0
        ? {
            signalDate: pendingFill.signalDate,
            trigger: pendingFill.trigger,
            orders: deferredOrders,
          }
        : undefined;
    }

    const portfolioPoint = computeWeightsSnapshot({ holdings, cash, prices, warnings });
    const equity = portfolioPoint.equityAbs;
    equityAbsByDay.push(equity);
    portfolioByDate.push({
      date: dates[i],
      ...portfolioPoint,
    });

    const targetWeights = resolveTargetWeightsForDate(req, dates[i]);
    const runtimeConstraints = buildRuntimeConstraintsForEquity(req.constraints, equity);
    const res = rebalanceCore({
      account: { cash },
      holdings,
      prices,
      targetWeights,
      constraints: runtimeConstraints,
      trigger: {
        driftThresholdPct: trigger.driftThresholdPct,
        minOrderNotional: trigger.minOrderNotional,
        minRebalanceIntervalSeconds: trigger.minRebalanceIntervalSeconds,
        lastRebalanceAt,
        now,
      },
    });

    appendUniqueWarnings(res.warnings);

    if (includeTimeline) {
      const deltas: Record<string, number> = (res as { explain?: { deltas?: Record<string, number>; equity?: number } }).explain?.deltas ?? {};
      const explainEquity = (res as { explain?: { equity?: number } }).explain?.equity;
      const driftEquity = toFinite(explainEquity, res.trigger.stats.equity);
      timeline.push({
        date: dates[i],
        trigger: res.trigger,
        topAbsDriftsPct01: computeTopAbsDriftsPct01({ deltas, equity: driftEquity, topN: 5 }),
      });
    }

    const canOpenRebalanceSignal = rebalanceDateSet === null || rebalanceDateSet.has(dates[i]);
    if (!pendingFill?.orders?.length && canOpenRebalanceSignal && res.trigger.shouldRebalance) {
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
    const pendingSymbols = [...new Set(pendingFill.orders.map((order) => String(order.symbol || "").trim()).filter(Boolean))].sort();
    warnings.push(
      `warning: pending rebalance signal on ${pendingFill.signalDate} left ${pendingFill.orders.length} order(s) unexecuted due to missing future real bars${pendingSymbols.length ? ` (${pendingSymbols.join(", ")})` : ""}`,
    );
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

  const normalizationStart = (() => {
    const firstEquityAbs = equityAbsByDay[0];
    if (!(Number.isFinite(fundedEquityAbs) && fundedEquityAbs > 0)) return 1;
    if (!(Number.isFinite(firstEquityAbs) && firstEquityAbs > 0)) return 1;
    const factor = firstEquityAbs / fundedEquityAbs;
    return Number.isFinite(factor) && factor > 0 ? factor : 1;
  })();

  const equity = cumulativeProduct(dailyReturns, normalizationStart);
  const metrics: BacktestMetrics = computeMetrics(equity, dailyReturns, { dates });

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
    portfolioByDate,
    timeline: includeTimeline ? timeline : undefined,
    states: includeEventStates && initialState && finalState ? { initial: initialState, final: finalState } : undefined,
  };
}
