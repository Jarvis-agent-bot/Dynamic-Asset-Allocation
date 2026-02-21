import { backtestDriftRebalance, type DriftRebalanceBacktestResult } from '@/src/core/backtestDriftRebalance';
import { loadPortfolioStateV1 } from '../../../portfolioStateStore';
import { saveJsonToLs, pretty } from '../../../wizardStorage';
import { resolveFundPriceV0, normalizePlanSymbol, toFiniteNumber, safeJsonParse, tryBuildSeriesBySymbolForPlan, type TargetWeight } from './DaaRebalancePanel.helpersV0';
import { LS_AUTO_PLAN_RESULT, LS_AUTO_PLAN_RESULT_A, LS_AUTO_PLAN_RESULT_B } from './DaaRebalancePanel.storageV0';

type FundLike = { code: string; name?: string; dwjz?: string | number; gsz?: string | number; estPricedCoverage?: number; estGsz?: number };

type PolicyLike = { [key: string]: unknown; thresholdPct?: number };

type AutoPlanSeedParams = {
  funds?: FundLike[];
  priceSnapshot: unknown;
  targetWeightsEffective: TargetWeight[];
  assetBlacklistSetV0: Set<string>;
  setAutoPlanErrorForActive: (value: string | null) => void;
  setAutoPlanInputTextForActive: (value: string) => void;
};

type AutoPlanRunParams = {
  autoPlanScenario: 'A' | 'B';
  autoPlanInputText: string;
  autoPlanThresholdPctUsed: number;
  rebalancePolicy: PolicyLike;
  targetWeights: unknown[];
  targetWeightsEffective: TargetWeight[];
  moneyPlan: unknown;
  assetBlacklistV0: string[];
  assetBlacklistSetV0: Set<string>;
  setAutoPlanErrorForActive: (value: string | null) => void;
  setAutoPlanResultForActive: (value: DriftRebalanceBacktestResult) => void;
};

export function buildRunConstraintsV0(mpLike: any, assetBlacklistV0: string[]) {
  const mpConstraints: any = mpLike?.constraints ?? {};
  const constraints: any = { minNotional: 0.01 };
  const maxPositionPct = toFiniteNumber(mpConstraints?.maxPositionPct);
  const maxIn = toFiniteNumber(mpConstraints?.maxIn);
  const maxOut = toFiniteNumber(mpConstraints?.maxOut);
  if (maxPositionPct !== null) constraints.maxPositionPct = maxPositionPct;
  if (maxIn !== null) constraints.maxIn = maxIn;
  if (maxOut !== null) constraints.maxOut = maxOut;
  if (assetBlacklistV0.length) constraints.assetBlacklist = assetBlacklistV0;
  return constraints;
}

export function buildAutoPlanHoldingsMapV0(positions: any, assetBlacklistSetV0: Set<string>) {
  const holdingsMap: Record<string, number> = {};
  for (const [symRaw, p] of Object.entries(positions ?? {})) {
    const sym = normalizePlanSymbol(symRaw);
    const qty = toFiniteNumber((p as any)?.qty);
    if (sym && !assetBlacklistSetV0.has(sym) && qty && qty > 0) holdingsMap[sym] = qty;
  }
  return holdingsMap;
}

export function buildRunHoldingsMapV0(positions: any, assetBlacklistSetV0: Set<string>) {
  const holdingsMap: Record<string, number> = {};
  for (const [symRaw, p] of Object.entries(positions ?? {})) {
    const sym = String(symRaw ?? '').trim();
    const qty = toFiniteNumber((p as any)?.qty);
    if (sym && !assetBlacklistSetV0.has(normalizePlanSymbol(sym)) && qty && qty > 0) holdingsMap[sym] = qty;
  }
  return holdingsMap;
}

export function buildPricesMapV0(args: {
  funds?: FundLike[];
  priceSnapshot: unknown;
  holdingsMap: Record<string, number>;
  targetWeightsInput: TargetWeight[];
}) {
  const byCode = new Map<string, FundLike>();
  for (const f of args.funds ?? []) {
    const code = String(f?.code ?? '').trim();
    if (code) byCode.set(code, f);
  }
  const pricesMap: Record<string, number> = {};
  const symbols = new Set<string>([...Object.keys(args.holdingsMap), ...args.targetWeightsInput.map((t) => t.id)]);
  for (const sym of symbols) {
    const pick = resolveFundPriceV0({ symbol: sym, snapshot: args.priceSnapshot, fund: byCode.get(sym) });
    const nav = pick.price;
    if (nav && nav > 0) pricesMap[sym] = nav;
  }
  return pricesMap;
}

export function seedAutoPlanFromCurrentSnapshotV0(params: AutoPlanSeedParams) {
  try {
    const st = loadPortfolioStateV1();
    const holdingsMap = buildAutoPlanHoldingsMapV0(st.positions, params.assetBlacklistSetV0);
    const pricesMap = buildPricesMapV0({
      funds: params.funds,
      priceSnapshot: params.priceSnapshot,
      holdingsMap,
      targetWeightsInput: params.targetWeightsEffective,
    });
    const syms = Object.keys(pricesMap).sort();
    if (!syms.length) {
      params.setAutoPlanErrorForActive('No prices found to seed snapshots. Please fill in the Price Snapshot first.');
      return;
    }
    const d0 = new Date();
    const d1 = new Date(d0.getTime() + 86400000);
    const d2 = new Date(d0.getTime() + 2 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const snap0: any = { date: fmt(d0), prices: {} as any };
    const snap1: any = { date: fmt(d1), prices: {} as any };
    const snap2: any = { date: fmt(d2), prices: {} as any };
    for (const sym of syms) {
      const px = Number((pricesMap as any)[sym]);
      if (!Number.isFinite(px) || px <= 0) continue;
      (snap0.prices as any)[sym] = px;
      (snap1.prices as any)[sym] = Number((px * 1.01).toFixed(6));
      (snap2.prices as any)[sym] = Number((px * 0.99).toFixed(6));
    }
    params.setAutoPlanErrorForActive(null);
    params.setAutoPlanInputTextForActive(pretty({ snapshots: [snap0, snap1, snap2] }));
  } catch (e) {
    params.setAutoPlanErrorForActive(e instanceof Error ? e.message : String(e));
  }
}

export function runAutoPlanV0(params: AutoPlanRunParams) {
  params.setAutoPlanErrorForActive(null);
  if (typeof window === 'undefined') return;
  if (!params.targetWeights.length) {
    params.setAutoPlanErrorForActive('Missing targetWeights. Please configure target weights first.');
    return;
  }
  const raw = String(params.autoPlanInputText ?? '').trim();
  if (!raw) {
    params.setAutoPlanErrorForActive('Provide drift input (seriesBySymbol or snapshots). Tip: click Seed from current snapshot.');
    return;
  }
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    params.setAutoPlanErrorForActive(parsed.error);
    return;
  }
  const seriesRes = tryBuildSeriesBySymbolForPlan(parsed.value);
  if (!seriesRes.ok) {
    params.setAutoPlanErrorForActive(seriesRes.error);
    return;
  }
  const st = loadPortfolioStateV1();
  const holdingsMap = buildAutoPlanHoldingsMapV0(st.positions, params.assetBlacklistSetV0);
  const targetWeightsMap: Record<string, number> = {};
  for (const t of params.targetWeightsEffective) {
    const id = normalizePlanSymbol((t as any)?.id);
    const w = toFiniteNumber((t as any)?.targetPct);
    if (!id) continue;
    if (w === null || w < 0) continue;
    targetWeightsMap[id] = w;
  }
  const required = new Set<string>([...Object.keys(holdingsMap), ...Object.keys(targetWeightsMap)]);
  const missing = Array.from(required).filter((sym) => !(sym in seriesRes.seriesBySymbol));
  if (missing.length) {
    params.setAutoPlanErrorForActive(`Missing symbols in series: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' ...' : ''}`);
    return;
  }
  const mp: any = params.moneyPlan as any;
  const constraints = buildRunConstraintsV0(mp, params.assetBlacklistV0);
  const cash0 = toFiniteNumber((st as any)?.cash) ?? 0;
  try {
    const res = backtestDriftRebalance({
      seriesBySymbol: seriesRes.seriesBySymbol as any,
      targetWeights: targetWeightsMap,
      initialHoldings: holdingsMap,
      initialCash: cash0,
      constraints,
      policy: { ...params.rebalancePolicy, thresholdPct: params.autoPlanThresholdPctUsed },
      bootstrapToTarget: false,
      includeEventStates: true,
    });
    params.setAutoPlanResultForActive(res);
    if (params.autoPlanScenario === 'A') {
      saveJsonToLs(LS_AUTO_PLAN_RESULT_A, res);
      saveJsonToLs(LS_AUTO_PLAN_RESULT, res);
    } else {
      saveJsonToLs(LS_AUTO_PLAN_RESULT_B, res);
    }
  } catch (e) {
    params.setAutoPlanErrorForActive(e instanceof Error ? e.message : String(e));
  }
}
