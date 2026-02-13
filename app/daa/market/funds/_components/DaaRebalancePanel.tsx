'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { LS_LEGACY_HOLDINGS, loadPortfolioStateV1, recordPortfolioLastRebalance, savePortfolioStateV1 } from '../../../portfolioStateStore';
import { getSnapshotPrice, loadPriceSnapshotV1, savePriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadTargetWeightsV1, persistTargetWeightsV1 } from '../../../targetWeightsStore';
import { loadRebalancePolicyV1 } from '../../../rebalancePolicyStore';
import { loadExecutionModeV0, persistExecutionModeV0, type ExecutionModeV0 } from '../../../executionModeStore';
import { OrdersReviewV0 } from '../../../_components/OrdersReviewV0';

import { simulateRebalanceWhatIfV0 } from '@/src/core/rebalanceWhatIf';
import { backtestDriftRebalance, type DriftRebalanceBacktestResult } from '@/src/core/backtestDriftRebalance';
import { coerceSeriesBySymbolInput, snapshotsToSeriesBySymbol } from '@/src/core/priceSnapshotsToSeries';
import { getExecutionAdapterV0 } from '@/src/daa/executionAdapterV0';
import { getPreTradeCashCheckV0 } from '@/src/daa/preTradeCashCheckV0';
import { buildRebalancePostRunSummaryV0, type RebalancePostRunSummaryV0 } from '@/src/daa/rebalancePostRunSummary';
import { useDaaRuntime } from '../../../useDaaRuntime';
import { useDaaWorkflowExportBundleV1 } from '../../../useDaaWorkflowExportBundleV1';
import {
  LS_MONEY_PLAN,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  pretty,
  readJsonFromLs,
  saveJsonToLs,
} from '../../../wizardStorage';

import DaaDashboardAiExplain from '../../../dashboard/_components/DaaDashboardAiExplain';
import DaaDashboardExport from '../../../dashboard/_components/DaaDashboardExport';
import DaaDashboardImport from '../../../dashboard/_components/DaaDashboardImport';
import DaaDashboardRunChecklist from '../../../dashboard/_components/DaaDashboardRunChecklist';

import Step1BacktestPage from '../../../step/_pages/Step1BacktestPage';
import Step2MarketEventsPage from '../../../step/_pages/Step2MarketEventsPage';
import Step4BaselineRecommendationPage from '../../../step/_pages/Step4BaselineRecommendationPage';
import Step6HumanFactorPage from '../../../step/_pages/Step6HumanFactorPage';
import Step7TagsPage from '../../../step/_pages/Step7TagsPage';

import DaaPortfolioEditorV0 from './DaaPortfolioEditorV0';
import DaaPriceSnapshotInputV0 from './DaaPriceSnapshotInputV0';
import DaaTargetWeightsEditorV0 from './DaaTargetWeightsEditorV0';
import DaaRebalancePolicyEditorV0 from './DaaRebalancePolicyEditorV0';
import DaaRebalanceLogViewV0 from './DaaRebalanceLogViewV0';

type FundLike = {
  code: string;
  name?: string;
  dwjz?: string | number;
  gsz?: string | number;
  estPricedCoverage?: number;
  estGsz?: number;
};

type HoldingsLike = Record<string, { share: number; cost?: number }>;

type Props = {
  // Optional: inject Market/Funds quotes + holdings so we can compute current weights.
  funds?: FundLike[];
  holdings?: HoldingsLike;
};

const LS_WHATIF_FEE_BPS = 'daa.whatif.feeBps';
const LS_WHATIF_SLIPPAGE_BPS = 'daa.whatif.slippageBps';
const LS_WHATIF_SLIPPAGE_SENSITIVITY_V0 = 'daa.whatif.slippageSensitivityV0';

type SlippageSensitivityV0 = 'LOW' | 'BASE' | 'HIGH';

const SLIPPAGE_SENSITIVITY_MULTIPLIER_V0: Record<SlippageSensitivityV0, number> = {
  LOW: 0.5,
  BASE: 1,
  HIGH: 2,
};
const LS_AUTO_PLAN_INPUT = 'daa.market.funds.autoPlan.input.v0';
const LS_AUTO_PLAN_RESULT = 'daa.market.funds.autoPlan.result.v0';

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickFundNav(fund: FundLike | undefined): number | null {
  if (!fund) return null;

  const coverage = toFiniteNumber(fund.estPricedCoverage) ?? 0;
  if (coverage > 0.05) {
    const est = toFiniteNumber(fund.estGsz);
    if (est && est > 0) return est;
  }

  const gsz = toFiniteNumber(fund.gsz);
  if (gsz && gsz > 0) return gsz;

  const dwjz = toFiniteNumber(fund.dwjz);
  if (dwjz && dwjz > 0) return dwjz;

  return null;
}

type TargetWeight = { id: string; label: string; targetPct: number };

type SuggestedOrder = {
  symbol: string;
  side: string;
  notional: number;
  reason?: string;
};

function normalizeOrders(x: unknown): SuggestedOrder[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => ({
      symbol: String(o?.symbol ?? ''),
      side: String(o?.side ?? ''),
      notional: Number(o?.notional ?? 0),
      reason: o?.reason === undefined ? undefined : String(o?.reason),
    }))
    .filter((o) => o.symbol && o.side && Number.isFinite(o.notional) && o.notional !== 0);
}

function normalizeTargetWeights(args: { response: unknown; moneyPlan: unknown }): TargetWeight[] {
  // Prefer weights returned by the engine if present; otherwise fall back to money_plan.allocations.
  if (args.response && typeof args.response === 'object') {
    const r: any = args.response as any;
    const raw = r.targetWeights ?? r.target_weights;

    if (Array.isArray(raw)) {
      return raw
        .filter(Boolean)
        .map((a: any) => ({
          id: String(a?.id ?? a?.symbol ?? ''),
          label: String(a?.label ?? a?.name ?? a?.id ?? a?.symbol ?? ''),
          targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0),
        }))
        .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.entries(raw as Record<string, unknown>)
        .map(([id, targetPct]) => ({ id, label: id, targetPct: Number(targetPct ?? 0) }))
        .filter((a) => a.id && Number.isFinite(a.targetPct));
    }
  }

  const mp: any = args.moneyPlan as any;
  const allocs = mp?.allocations;
  if (!Array.isArray(allocs)) return [];

  return allocs
    .filter(Boolean)
    .map((a: any) => ({
      id: String(a?.id ?? ''),
      label: String(a?.label ?? a?.id ?? ''),
      targetPct: Number(a?.targetPct ?? 0),
    }))
    .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
}

function normalizeTargetWeightsAny(raw: unknown): TargetWeight[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .filter(Boolean)
      .map((a: any) => ({
        id: String(a?.id ?? a?.symbol ?? ''),
        label: String(a?.label ?? a?.name ?? a?.id ?? a?.symbol ?? ''),
        targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0),
      }))
      .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
  }

  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([id, targetPct]) => ({ id, label: id, targetPct: Number(targetPct ?? 0) }))
      .filter((a) => a.id && Number.isFinite(a.targetPct));
  }

  return [];
}

function formatOrdersMarkdown(orders: SuggestedOrder[]) {
  const rows = orders.map((o) => `| ${o.symbol} | ${o.side} | ${o.notional.toFixed(2)} | ${o.reason ? o.reason.replace(/\|/g, ' ') : ''} |`);
  return [
    '| Symbol | Side | Notional | Why |',
    '| --- | --- | ---: | --- |',
    ...rows,
  ].join('\n');
}

function formatWeightsMarkdown(rows: Array<{ id: string; label: string; currentPct: number; targetPct: number; deltaPct: number }>) {
  const lines = rows.map((r) => `| ${r.label} (${r.id}) | ${(r.currentPct * 100).toFixed(1)}% | ${(r.targetPct * 100).toFixed(1)}% | ${(r.deltaPct * 100).toFixed(1)}% |`);
  return ['| Asset | Current | Target | Delta |', '| --- | ---: | ---: | ---: |', ...lines].join('\n');
}

type DriftAlertBreach = {
  id: string;
  label: string;
  // Signed drift vs target (currentPct - targetPct).
  driftPct: number;
};

type DriftAlertV0 = {
  at: string;
  source: 'ui-pre' | 'core';
  thresholdPct: number;
  maxAbsDriftPct: number;
  maxAbsDriftSymbol: string | null;
  breached: boolean;
  breaches: DriftAlertBreach[];
  // Optional: surface trigger policy verdict when we have it.
  shouldRebalance?: boolean;
  eligibleOrderCount?: number;
  reasons?: string[];
};

type PaperRunHealthcheckV0 = {
  expected: RebalancePostRunSummaryV0 | null;
  actual: RebalancePostRunSummaryV0 | null;
  pass: boolean | null;
  notes: string[];
};

function fmtPct01(x: number) {
  if (!Number.isFinite(x)) return 'n/a';
  return `${(x * 100).toFixed(2)}%`;
}

function computeDriftAlertFromTableRows(args: {
  at: string;
  rows: Array<{ id: string; label: string; deltaPct: number }>;
  thresholdPct: number;
}): DriftAlertV0 {
  let maxAbs = 0;
  let maxSym: string | null = null;

  for (const r of args.rows) {
    const abs = Math.abs(r.deltaPct);
    if (!Number.isFinite(abs)) continue;
    if (abs > maxAbs) {
      maxAbs = abs;
      maxSym = r.id;
    }
  }

  const thresholdPct = Number.isFinite(args.thresholdPct) && args.thresholdPct > 0 ? args.thresholdPct : 0;
  const breaches = args.rows
    .filter((r) => Number.isFinite(r.deltaPct) && thresholdPct > 0 && Math.abs(r.deltaPct) >= thresholdPct)
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 6)
    .map((r) => ({ id: r.id, label: r.label, driftPct: r.deltaPct }));

  return {
    at: args.at,
    source: 'ui-pre',
    thresholdPct,
    maxAbsDriftPct: maxAbs,
    maxAbsDriftSymbol: maxSym,
    breached: thresholdPct > 0 && maxAbs >= thresholdPct,
    breaches,
  };
}

function computeDriftAlertFromCoreResponse(args: { at: string; resp: any; fallbackThresholdPct: number }): DriftAlertV0 {
  const stats: any = args.resp?.trigger?.stats ?? {};
  const explain: any = args.resp?.explain ?? {};

  const equity = toFiniteNumber(explain?.equity) ?? toFiniteNumber(stats?.equity) ?? 0;

  const thresholdPct =
    (toFiniteNumber(stats?.thresholdPct) ?? null) !== null && (toFiniteNumber(stats?.thresholdPct) as number) > 0
      ? (toFiniteNumber(stats?.thresholdPct) as number)
      : args.fallbackThresholdPct;

  const labels = new Map<string, string>();
  if (Array.isArray(args.resp?.targetWeights)) {
    for (const w of args.resp.targetWeights) {
      const id = String((w as any)?.id ?? '').trim();
      if (!id) continue;
      const label = String((w as any)?.label ?? id).trim() || id;
      labels.set(id, label);
    }
  }

  const breaches: DriftAlertBreach[] = [];
  let maxAbs = 0;
  let maxSym: string | null = null;

  const deltas = explain?.deltas;
  if (equity > 0 && deltas && typeof deltas === 'object' && !Array.isArray(deltas)) {
    for (const [idRaw, deltaRaw] of Object.entries(deltas as Record<string, unknown>)) {
      const id = String(idRaw ?? '').trim();
      if (!id) continue;

      const delta = toFiniteNumber(deltaRaw);
      if (delta === null) continue;

      // delta = desired - current (notional). driftPct = currentPct - targetPct = -delta / equity.
      const driftPct = -delta / equity;
      if (!Number.isFinite(driftPct)) continue;

      const abs = Math.abs(driftPct);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxSym = id;
      }

      if (thresholdPct > 0 && abs >= thresholdPct) {
        breaches.push({ id, label: labels.get(id) ?? id, driftPct });
      }
    }
  }

  breaches.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));
  const topBreaches = breaches.slice(0, 6);

  const maxAbsFromStats = toFiniteNumber(stats?.maxAbsDriftPct);
  const maxSymFromStats = typeof stats?.maxAbsDriftSymbol === 'string' && stats.maxAbsDriftSymbol ? String(stats.maxAbsDriftSymbol) : null;

  const maxAbsFinal = maxAbsFromStats !== null ? maxAbsFromStats : maxAbs;
  const maxSymFinal = maxSymFromStats ?? maxSym;

  const reasonsRaw = args.resp?.trigger?.reasons;
  const reasons = Array.isArray(reasonsRaw) ? reasonsRaw.map((x: any) => String(x)) : undefined;

  return {
    at: args.at,
    source: 'core',
    thresholdPct,
    maxAbsDriftPct: maxAbsFinal,
    maxAbsDriftSymbol: maxSymFinal,
    breached: thresholdPct > 0 && maxAbsFinal >= thresholdPct,
    breaches: topBreaches,
    shouldRebalance: !!args.resp?.trigger?.shouldRebalance,
    eligibleOrderCount: toFiniteNumber(stats?.eligibleOrderCount) ?? undefined,
    reasons,
  };
}

export function DaaRebalancePanel({ funds, holdings }: Props) {
  const rt = useDaaRuntime();
  const { exportBundle } = useDaaWorkflowExportBundleV1();

  // Funds hub shortest path: keep DAA Workflow expanded by default.
  const [open, setOpen] = useState(true);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyOrdersStatus, setCopyOrdersStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyWeightsStatus, setCopyWeightsStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [sampleStatus, setSampleStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [autoPlanInputText, setAutoPlanInputText] = useState(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
    if (saved && typeof saved === 'object' && typeof (saved as any).text === 'string') return (saved as any).text;
    return '';
  });

  const [autoPlanResult, setAutoPlanResult] = useState<DriftRebalanceBacktestResult | null>(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_RESULT);
    return saved && typeof saved === 'object' && (saved as any).schemaVersion === 1 ? (saved as any as DriftRebalanceBacktestResult) : null;
  });

  const [autoPlanError, setAutoPlanError] = useState<string | null>(null);
  const [autoPlanCopyStatus, setAutoPlanCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [driftFilter, setDriftFilter] = useState<'all' | 'over' | 'under'>('all');

  const [rev, setRev] = useState(0);
  const executionMode: ExecutionModeV0 = useMemo(() => loadExecutionModeV0(), [rev]);

  const [paperRunLoading, setPaperRunLoading] = useState(false);
  const [paperRunError, setPaperRunError] = useState<string | null>(null);
  const [paperRunRecordedAt, setPaperRunRecordedAt] = useState<string | null>(null);
  const [paperRunSummary, setPaperRunSummary] = useState<string | null>(null);
  const [paperRunPostSummary, setPaperRunPostSummary] = useState<RebalancePostRunSummaryV0 | null>(null);
  const [paperRunHealthcheck, setPaperRunHealthcheck] = useState<PaperRunHealthcheckV0 | null>(null);
  const [paperRunDriftAlert, setPaperRunDriftAlert] = useState<DriftAlertV0 | null>(null);
  const [paperRunExecutionMode, setPaperRunExecutionMode] = useState<ExecutionModeV0>("paper");
  const paperRunAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener('storage', onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener('storage', onData);
    };
  }, []);

  useEffect(() => {
    // Persist the latest drift input so users can refresh and keep the plan editor state.
    saveJsonToLs(LS_AUTO_PLAN_INPUT, { text: autoPlanInputText });
  }, [autoPlanInputText]);

  const moneyPlan = useMemo(() => readJsonFromLs(LS_MONEY_PLAN), [rev]);
  const rebalanceReq = useMemo(() => readJsonFromLs(LS_REBALANCE_REQUEST), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);

  const rebalancePolicy = useMemo(() => loadRebalancePolicyV1(), [rev]);

  // Use the same threshold for trigger policy, drift badges, and quick filters.
  const driftThresholdPct = useMemo(() => {
    const t = toFiniteNumber((rebalancePolicy as any)?.thresholdPct);
    return t !== null && t > 0 ? t : 0.01;
  }, [rebalancePolicy]);

  const baseCcy = useMemo(() => {
    const mp: any = moneyPlan as any;
    return typeof mp?.account?.baseCcy === 'string' ? String(mp.account.baseCcy) : null;
  }, [moneyPlan]);

  async function doCopyBundle() {
    try {
      await copyTextToClipboard(pretty(exportBundle));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  async function applySampleScenarioV0() {
    if (typeof window === 'undefined') return;

    const ok = window.confirm(
      'Load sample scenario v0? This will overwrite local demo data (portfolio, price snapshot, targetWeights) and clear last rebalance request/response.'
    );
    if (!ok) return;

    try {
      const at = new Date().toISOString();

      const legacyHoldings: HoldingsLike = {
        '005963': { share: 1000, cost: 1.2 },
        '007300': { share: 500, cost: 1.0 },
      };

      // Keep the legacy `holdings` key in sync so the Market/Funds page and older exports keep working.
      window.localStorage.setItem(LS_LEGACY_HOLDINGS, JSON.stringify(legacyHoldings));

      savePortfolioStateV1({
        schemaVersion: 1,
        updatedAt: at,
        cash: 1000,
        positions: {
          '005963': { qty: 1000, cost: 1.2 },
          '007300': { qty: 500, cost: 1.0 },
        },
      });

      savePriceSnapshotV1({
        schemaVersion: 1,
        updatedAt: at,
        prices: {
          '005963': { price: 1.234 },
          '007300': { price: 1.052 },
          '000001': { price: 1.4 },
        },
      });

      persistTargetWeightsV1([
        { id: '005963', label: '005963', targetPct: 0.4 },
        { id: '007300', label: '007300', targetPct: 0.3 },
        { id: '000001', label: '000001', targetPct: 0.3 },
      ]);

      // Clear stale outputs so the demo reflects the newly loaded scenario.
      window.localStorage.removeItem(LS_REBALANCE_REQUEST);
      window.localStorage.removeItem(LS_REBALANCE_RESPONSE);

      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));

      setSampleStatus('ok');
      window.setTimeout(() => setSampleStatus('idle'), 1200);

      setOpen(true);
      window.setTimeout(() => scrollToId('rebalance'), 50);
    } catch {
      setSampleStatus('error');
      window.setTimeout(() => setSampleStatus('idle'), 2000);
    }
  }

  const nextJump = useMemo(() => {
    if (rt.nextStepId === null) return { targetId: 'export', buttonText: '下一步：去导出' };
    return { targetId: `step${rt.nextStepId}`, buttonText: `下一步：去 Step${rt.nextStepId}` };
  }, [rt.nextStepId]);

  function jumpTo(targetId: string) {
    // Ensure the panel is open before scrolling.
    setOpen(true);
    window.setTimeout(() => scrollToId(targetId), 50);
  }

  const headline = useMemo(() => {
    const readyBits = [rt.marketEventCount ? 'events' : null, rt.hasRecommendation ? 'recommendation' : null, rt.hasHumanProfile ? 'human' : null].filter(Boolean);
    const readyText = readyBits.length ? readyBits.join(' + ') : 'empty';
    return `下一步: ${rt.nextActionText}（data: ${readyText}）`;
  }, [rt.hasHumanProfile, rt.hasRecommendation, rt.marketEventCount, rt.nextActionText]);

  const step1SummaryText = useMemo(() => {
    const x: any = rt.step1Backtest;
    if (!x) return 'Step1 backtest: <not run yet>'; // write-back comes from Step1 UI

    const input = x?.input ?? {};
    const symbol = input?.symbol ? String(input.symbol) : '';
    const start = input?.start ? String(input.start) : '';
    const end = input?.end ? String(input.end) : '';

    const summary = x?.summary ?? null;
    const metrics = summary?.metrics ?? null;

    const bestName = summary?.bestStrategyName ? String(summary.bestStrategyName) : '';
    const bestScore = Number(summary?.bestScore);

    const tr = metrics?.totalReturn === undefined ? null : Number(metrics.totalReturn);
    const mdd = metrics?.maxDrawdown === undefined ? null : Number(metrics.maxDrawdown);

    const bits: string[] = [];
    if (symbol && start && end) bits.push(`${symbol} ${start}→${end}`);
    if (bestName) bits.push(`best=${bestName}`);
    if (Number.isFinite(bestScore)) bits.push(`score=${bestScore.toFixed(4)}`);
    if (tr !== null && Number.isFinite(tr)) bits.push(`ret=${(tr * 100).toFixed(2)}%`);
    if (mdd !== null && Number.isFinite(mdd)) bits.push(`mdd=${(mdd * 100).toFixed(2)}%`);

    const tail = bits.length ? bits.join(' | ') : '<loaded>';
    return `Step1 backtest: ${tail}`;
  }, [rt.step1Backtest]);

  const portfolioCash = useMemo(() => {
    try {
      return loadPortfolioStateV1().cash;
    } catch {
      return 0;
    }
  }, [rev]);

  const portfolioLastRebalanceAt = useMemo(() => {
    try {
      return loadPortfolioStateV1().lastRebalance?.at ?? null;
    } catch {
      return null;
    }
  }, [rev]);

  const priceSnapshot = useMemo(() => loadPriceSnapshotV1(), [rev]);

  const manualTargetWeights = useMemo(() => loadTargetWeightsV1(), [rev]);
  const computedTargetWeights = useMemo(() => normalizeTargetWeights({ response: rebalanceResp, moneyPlan }), [moneyPlan, rebalanceResp]);
  // Funds hub: prefer user-edited targetWeights when present.
  const targetWeights = manualTargetWeights.length ? manualTargetWeights : computedTargetWeights;
  const targetWeightsSource = manualTargetWeights.length ? 'manual' : 'engine/money_plan';

  const lastRunTargetWeightsPre = useMemo(() => {
    if (rebalanceReq && typeof rebalanceReq === 'object') {
      const r: any = rebalanceReq as any;
      const raw = r.targetWeights ?? r.target_weights;
      const tw = normalizeTargetWeightsAny(raw);
      if (tw.length) return tw;
    }
    return targetWeights;
  }, [rebalanceReq, targetWeights]);

  const lastRunTargetWeightsPost = useMemo(() => {
    if (rebalanceResp && typeof rebalanceResp === 'object') {
      const r: any = rebalanceResp as any;
      const raw = r.targetWeights ?? r.target_weights;
      const tw = normalizeTargetWeightsAny(raw);
      if (tw.length) return tw;
    }
    return lastRunTargetWeightsPre;
  }, [rebalanceResp, lastRunTargetWeightsPre]);

  const engineOrders = useMemo(() => {
    if (!rebalanceResp || typeof rebalanceResp !== 'object') return [];
    const r: any = rebalanceResp as any;
    return normalizeOrders(r.orders);
  }, [rebalanceResp]);

  const holdingsForWeights = useMemo(() => {
    if (holdings && Object.keys(holdings).length) return holdings;

    try {
      const st = loadPortfolioStateV1();
      const out: HoldingsLike = {};
      for (const [codeRaw, p] of Object.entries(st.positions ?? {})) {
        const code = String(codeRaw ?? '').trim();
        if (!code) continue;

        const qty = toFiniteNumber((p as any)?.qty);
        if (!qty || qty <= 0) continue;

        const costRaw = (p as any)?.cost;
        const costNum = costRaw === undefined ? null : toFiniteNumber(costRaw);
        out[code] = costNum !== null && costNum !== undefined ? { share: qty, cost: costNum } : { share: qty };
      }
      return out;
    } catch {
      return {} as HoldingsLike;
    }
  }, [holdings, rev]);

  const currentWeights = useMemo(() => {
    if (!holdingsForWeights || !Object.keys(holdingsForWeights).length) return [] as Array<{ id: string; label: string; value: number }>;

    const byCode = new Map<string, FundLike>();
    for (const f of funds ?? []) {
      const code = String(f?.code ?? '').trim();
      if (code) byCode.set(code, f);
    }

    const rows: Array<{ id: string; label: string; value: number }> = [];
    for (const [codeRaw, h] of Object.entries(holdingsForWeights ?? {})) {
      const code = String(codeRaw ?? '').trim();
      if (!code) continue;

      const share = toFiniteNumber((h as any)?.share);
      if (!share || share <= 0) continue;

      const fund = byCode.get(code);
      const manual = getSnapshotPrice(priceSnapshot, code);
      const nav = manual ?? pickFundNav(fund ?? undefined);

      const value = nav ? share * nav : 0;
      if (value <= 0) continue;

      rows.push({ id: code, label: String((fund as any)?.name ?? code), value });
    }

    rows.sort((a, b) => b.value - a.value);
    return rows;
  }, [funds, holdingsForWeights, priceSnapshot]);

  const rebalanceTableRows = useMemo(() => {
    const total = currentWeights.reduce((acc, r) => acc + r.value, 0) + Math.max(0, toFiniteNumber(portfolioCash) ?? 0);
    if (!Number.isFinite(total) || total <= 0) return [] as Array<{ id: string; label: string; currentPct: number; targetPct: number; deltaPct: number }>;

    const currentById = new Map<string, { label: string; currentPct: number }>();
    for (const r of currentWeights) currentById.set(r.id, { label: r.label, currentPct: r.value / total });

    const targetById = new Map<string, { label: string; targetPct: number }>();
    for (const t of targetWeights) targetById.set(t.id, { label: t.label, targetPct: t.targetPct });

    const ids = Array.from(new Set([...Array.from(currentById.keys()), ...Array.from(targetById.keys())]));

    const rows = ids
      .map((id) => {
        const c = currentById.get(id);
        const t = targetById.get(id);
        const label = t?.label ?? c?.label ?? id;
        const currentPct = c?.currentPct ?? 0;
        const targetPct = t?.targetPct ?? 0;
        const deltaPct = currentPct - targetPct;
        return { id, label, currentPct, targetPct, deltaPct };
      })
      .filter((r) => r.currentPct > 0 || r.targetPct > 0);

    rows.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
    return rows;
  }, [currentWeights, portfolioCash, targetWeights]);

  const driftCounts = useMemo(() => {
    let over = 0;
    let under = 0;
    let within = 0;

    for (const r of rebalanceTableRows) {
      if (r.deltaPct >= driftThresholdPct) over += 1;
      else if (r.deltaPct <= -driftThresholdPct) under += 1;
      else within += 1;
    }

    return { total: rebalanceTableRows.length, over, under, within };
  }, [rebalanceTableRows, driftThresholdPct]);

  const filteredRebalanceTableRows = useMemo(() => {
    if (driftFilter === 'over') return rebalanceTableRows.filter((r) => r.deltaPct >= driftThresholdPct);
    if (driftFilter === 'under') return rebalanceTableRows.filter((r) => r.deltaPct <= -driftThresholdPct);
    return rebalanceTableRows;
  }, [driftFilter, rebalanceTableRows, driftThresholdPct]);

  const naiveOrders = useMemo(() => {
    if (!rebalanceTableRows.length) return [] as SuggestedOrder[];

    const total = currentWeights.reduce((acc, r) => acc + r.value, 0) + Math.max(0, toFiniteNumber(portfolioCash) ?? 0);
    if (!Number.isFinite(total) || total <= 0) return [];

    // v0: ignore taxes/fees and lot sizes; generate notional-based orders.
    const minNotional = Math.max(10, total * 0.002); // >=0.2% or 10 base units

    const out: SuggestedOrder[] = [];
    for (const r of rebalanceTableRows) {
      const deltaValue = (r.targetPct - r.currentPct) * total;
      if (!Number.isFinite(deltaValue) || Math.abs(deltaValue) < minNotional) continue;

      const side = deltaValue > 0 ? 'BUY' : 'SELL';
      const notional = Math.abs(deltaValue);
      out.push({
        symbol: r.id,
        side,
        notional,
        reason: `delta=${((r.targetPct - r.currentPct) * 100).toFixed(1)}% (naive)`
      });
    }

    out.sort((a, b) => b.notional - a.notional);
    return out;
  }, [currentWeights, portfolioCash, rebalanceTableRows]);

  const effectiveOrders = engineOrders.length ? engineOrders : naiveOrders;

  const [whatIfFeeBps, setWhatIfFeeBps] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(LS_WHATIF_FEE_BPS);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) ? n : 0;
  });

  const [whatIfSlippageBps, setWhatIfSlippageBps] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(LS_WHATIF_SLIPPAGE_BPS);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) ? n : 0;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_WHATIF_FEE_BPS, String(whatIfFeeBps));
  }, [whatIfFeeBps]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_WHATIF_SLIPPAGE_BPS, String(whatIfSlippageBps));
  }, [whatIfSlippageBps]);

  const [whatIfSlippageSensitivityV0, setWhatIfSlippageSensitivityV0] = useState<SlippageSensitivityV0>(() => {
    if (typeof window === 'undefined') return 'BASE';
    const raw = window.localStorage.getItem(LS_WHATIF_SLIPPAGE_SENSITIVITY_V0);
    return raw === 'LOW' || raw === 'BASE' || raw === 'HIGH' ? raw : 'BASE';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_WHATIF_SLIPPAGE_SENSITIVITY_V0, String(whatIfSlippageSensitivityV0));
  }, [whatIfSlippageSensitivityV0]);

  const whatIfSlippageBpsUsed = useMemo(() => {
    const base = toFiniteNumber(whatIfSlippageBps) ?? 0;
    const mult = SLIPPAGE_SENSITIVITY_MULTIPLIER_V0[whatIfSlippageSensitivityV0] ?? 1;
    const out = base * mult;
    return Number.isFinite(out) && out >= 0 ? out : 0;
  }, [whatIfSlippageBps, whatIfSlippageSensitivityV0]);

  const whatIfValuesBySymbol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of currentWeights) out[r.id] = r.value;
    return out;
  }, [currentWeights]);

  const whatIfTargetWeightsPreBySymbol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of lastRunTargetWeightsPre) out[t.id] = t.targetPct;
    return out;
  }, [lastRunTargetWeightsPre]);

  const whatIfTargetWeightsPostBySymbol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of lastRunTargetWeightsPost) out[t.id] = t.targetPct;
    return out;
  }, [lastRunTargetWeightsPost]);

  const whatIfLabelsBySymbol = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of currentWeights) out[r.id] = r.label;
    for (const t of lastRunTargetWeightsPre) out[t.id] = t.label;
    for (const t of lastRunTargetWeightsPost) out[t.id] = t.label;
    return out;
  }, [currentWeights, lastRunTargetWeightsPre, lastRunTargetWeightsPost]);

  const whatIf = useMemo(() => {
    if (!effectiveOrders.length) return null;

    return simulateRebalanceWhatIfV0({
      cashStart: toFiniteNumber(portfolioCash) ?? 0,
      valuesBySymbol: whatIfValuesBySymbol,
      targetWeightsBySymbol: whatIfTargetWeightsPostBySymbol,
      orders: effectiveOrders
        .filter((o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0)
        .map((o) => ({ symbol: o.symbol, side: o.side as 'BUY' | 'SELL', notional: o.notional })),
      feeBps: whatIfFeeBps,
      slippageBps: whatIfSlippageBpsUsed,
      labelsBySymbol: whatIfLabelsBySymbol,
    });
  }, [effectiveOrders, portfolioCash, whatIfFeeBps, whatIfLabelsBySymbol, whatIfSlippageBpsUsed, whatIfTargetWeightsPostBySymbol, whatIfValuesBySymbol]);

  const preTradeCashCheck = useMemo(() => {
    return getPreTradeCashCheckV0({
      cashStart: portfolioCash,
      orders: effectiveOrders,
      feeBps: whatIfFeeBps,
      slippageBps: whatIfSlippageBpsUsed,
      baseCcy,
    });
  }, [baseCcy, effectiveOrders, portfolioCash, whatIfFeeBps, whatIfSlippageBpsUsed]);

  const whatIfRows = useMemo(() => {
    if (!whatIf) return [] as Array<{
      id: string;
      label: string;
      valueBefore: number;
      valueAfter: number;
      currentPct: number;
      targetPrePct: number;
      targetPct: number;
      postPct: number;
      driftPct: number;
    }>;

    const sumTargetPre = Object.values(whatIfTargetWeightsPreBySymbol).reduce((acc, x) => acc + (Number.isFinite(x) ? x : 0), 0);
    const sumTargetPost = Object.values(whatIfTargetWeightsPostBySymbol).reduce((acc, x) => acc + (Number.isFinite(x) ? x : 0), 0);

    const targetCashPrePct = Math.max(0, 1 - sumTargetPre);
    const targetCashPostPct = Math.max(0, 1 - sumTargetPost);

    const cashPostPct = whatIf.totalAfter > 0 ? whatIf.cashAfter / whatIf.totalAfter : 0;

    const cashRow = {
      id: 'CASH',
      label: 'Cash',
      valueBefore: whatIf.cashBefore,
      valueAfter: whatIf.cashAfter,
      currentPct: whatIf.totalBefore > 0 ? whatIf.cashBefore / whatIf.totalBefore : 0,
      targetPrePct: targetCashPrePct,
      targetPct: targetCashPostPct,
      postPct: cashPostPct,
      driftPct: cashPostPct - targetCashPostPct,
    };

    const rows = whatIf.rows.map((r) => ({ ...r, targetPrePct: whatIfTargetWeightsPreBySymbol[r.id] ?? 0 }));
    return [cashRow, ...rows];
  }, [whatIf, whatIfTargetWeightsPreBySymbol, whatIfTargetWeightsPostBySymbol]);

  async function doCopyOrders() {
    try {
      const payload = {
        source: engineOrders.length ? 'engine' : 'naive',
        at: new Date().toISOString(),
        orders: effectiveOrders,
      };
      const text = [
        '# Suggested Orders (v0)',
        '',
        formatOrdersMarkdown(effectiveOrders),
        '',
        '```json',
        JSON.stringify(payload, null, 2),
        '```',
      ].join('\n');

      await copyTextToClipboard(text);
      setCopyOrdersStatus('ok');
      window.setTimeout(() => setCopyOrdersStatus('idle'), 1200);
    } catch {
      setCopyOrdersStatus('error');
      window.setTimeout(() => setCopyOrdersStatus('idle'), 2000);
    }
  }

  async function doCopyWeights() {
    try {
      const text = [
        '# Current vs Target (v0)',
        '',
        formatWeightsMarkdown(rebalanceTableRows),
        '',
        '```json',
        JSON.stringify({ at: new Date().toISOString(), rows: rebalanceTableRows }, null, 2),
        '```',
      ].join('\n');
      await copyTextToClipboard(text);
      setCopyWeightsStatus('ok');
      window.setTimeout(() => setCopyWeightsStatus('idle'), 1200);
    } catch {
      setCopyWeightsStatus('error');
      window.setTimeout(() => setCopyWeightsStatus('idle'), 2000);
    }
  }

  function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, error: 'JSON parse failed' };
    }
  }

  function normalizePlanSymbol(sym: unknown): string {
    return String(sym ?? "").trim().toUpperCase();
  }

  function tryBuildSeriesBySymbolForPlan(
    input: unknown,
  ): { ok: true; seriesBySymbol: Record<string, any[]>; symbols: string[] } | { ok: false; error: string } {
    // 1) Accept direct series map or {seriesBySymbol: ...}
    const coerced = coerceSeriesBySymbolInput(input) as any;
    const symbolsFromSeries = Object.keys(coerced || {}).filter(Boolean).sort();
    if (symbolsFromSeries.length) return { ok: true, seriesBySymbol: coerced, symbols: symbolsFromSeries };

    // 2) Accept snapshots: [{date, prices}] or {snapshots:[...]} or {"YYYY-MM-DD": {SYM: px}}
    try {
      const s = (() => {
        if (Array.isArray(input)) return input;
        if (input && typeof input === "object" && !Array.isArray(input)) {
          const r: any = input as any;
          if (Array.isArray(r.snapshots)) return r.snapshots;

          const entries = Object.entries(r as Record<string, unknown>);
          const looksLikeDateMap = entries.some(([k]) => /^\d{4}-\d{2}-\d{2}/.test(String(k)));
          if (looksLikeDateMap) return entries.map(([date, prices]) => ({ date, prices }));
        }
        return null;
      })();

      if (!s) return { ok: false, error: "Input is neither seriesBySymbol nor snapshots" };

      const { seriesBySymbol, symbols } = snapshotsToSeriesBySymbol(s as any);
      return { ok: true, seriesBySymbol: seriesBySymbol as any, symbols };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  function formatWeightsDiffLines(args: {
    before?: { cashPct01: number; weightsBySymbolPct01: Record<string, number> };
    after?: { cashPct01: number; weightsBySymbolPct01: Record<string, number> };
  }): string[] {
    const before = args.before;
    const after = args.after;
    if (!before || !after) return ["(missing before/after snapshots)"];

    const syms = new Set<string>();
    for (const k of Object.keys(before.weightsBySymbolPct01 || {})) syms.add(k);
    for (const k of Object.keys(after.weightsBySymbolPct01 || {})) syms.add(k);
    const list = Array.from(syms).sort();

    const rows: string[] = [];
    rows.push(`cash: ${fmtPct01(before.cashPct01)} → ${fmtPct01(after.cashPct01)} (Δ ${fmtPct01(after.cashPct01 - before.cashPct01)})`);

    for (const sym of list) {
      const b = Number((before.weightsBySymbolPct01 as any)[sym] ?? 0);
      const a = Number((after.weightsBySymbolPct01 as any)[sym] ?? 0);
      rows.push(`${sym}: ${fmtPct01(b)} → ${fmtPct01(a)} (Δ ${fmtPct01(a - b)})`);
    }

    return rows;
  }

  function buildAutoPlanMarkdownV0(res: DriftRebalanceBacktestResult): string {
    const parts: string[] = [];

    parts.push("# Auto rebalance plan (v0)");
    parts.push("");
    parts.push(
      `rebalanceCount=${res.summary.rebalanceCount}; turnoverNotional=${res.summary.turnoverNotional.toFixed(2)}; equityAbs=${res.summary.initialEquityAbs.toFixed(2)} → ${res.summary.finalEquityAbs.toFixed(2)}`,
    );
    if (res.warnings?.length) parts.push(`warnings: ${res.warnings.length}`);
    parts.push("");

    if (res.states) {
      parts.push("## Overall weight diff");
      parts.push("");
      parts.push(...formatWeightsDiffLines({ before: res.states.initial, after: res.states.final }));
      parts.push("");
    }

    parts.push("## Events");
    parts.push("");

    for (const ev of res.events || []) {
      const stats: any = (ev as any).trigger?.stats ?? {};

      parts.push(`### ${ev.kind} @ ${ev.date}`);
      parts.push("");
      parts.push(
        `shouldRebalance=${String((ev as any).trigger?.shouldRebalance)}; maxAbsDriftPct=${fmtPct01(Number(stats.maxAbsDriftPct ?? NaN))}; maxAbsDriftSymbol=${String(stats.maxAbsDriftSymbol ?? "")}`,
      );
      parts.push("");

      parts.push("Diff:");
      parts.push(...formatWeightsDiffLines({ before: (ev as any).before, after: (ev as any).after }).map((l) => `- ${l}`));
      parts.push("");

      parts.push("Orders:");
      parts.push("```json");
      parts.push(JSON.stringify((ev as any).orders ?? [], null, 2));
      parts.push("```");
      parts.push("");
    }

    return parts.join("\n");
  }

  async function doCopyAutoPlanV0() {
    if (!autoPlanResult) return;
    try {
      const md = buildAutoPlanMarkdownV0(autoPlanResult);
      await copyTextToClipboard(md);
      setAutoPlanCopyStatus("ok");
      window.setTimeout(() => setAutoPlanCopyStatus("idle"), 1200);
    } catch {
      setAutoPlanCopyStatus("error");
      window.setTimeout(() => setAutoPlanCopyStatus("idle"), 2000);
    }
  }

  function seedAutoPlanFromCurrentSnapshotV0() {
    try {
      const st = loadPortfolioStateV1();

      const holdingsMap: Record<string, number> = {};
      for (const [symRaw, p] of Object.entries(st.positions ?? {})) {
        const sym = normalizePlanSymbol(symRaw);
        if (!sym) continue;

        const qty = toFiniteNumber((p as any)?.qty);
        if (!qty || qty <= 0) continue;

        holdingsMap[sym] = qty;
      }

      const byCode = new Map<string, FundLike>();
      for (const f of funds ?? []) {
        const code = normalizePlanSymbol((f as any)?.code);
        if (code) byCode.set(code, f);
      }

      const pricesMap: Record<string, number> = {};
      const symbols = new Set<string>([...Object.keys(holdingsMap), ...targetWeights.map((t) => normalizePlanSymbol((t as any)?.id))]);

      for (const sym of symbols) {
        const manual = getSnapshotPrice(priceSnapshot, sym);
        const nav = manual ?? pickFundNav(byCode.get(sym));
        if (nav && nav > 0) pricesMap[sym] = nav;
      }

      const syms = Object.keys(pricesMap).sort();
      if (!syms.length) {
        setAutoPlanError("No prices found to seed snapshots. Please fill in the Price Snapshot first.");
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

        // Tiny drift seed: +1% then -1%. Replace with real scenarios/history.
        (snap0.prices as any)[sym] = px;
        (snap1.prices as any)[sym] = Number((px * 1.01).toFixed(6));
        (snap2.prices as any)[sym] = Number((px * 0.99).toFixed(6));
      }

      setAutoPlanError(null);
      setAutoPlanInputText(pretty({ snapshots: [snap0, snap1, snap2] }));
    } catch (e) {
      setAutoPlanError(e instanceof Error ? e.message : String(e));
    }
  }

  function runAutoPlanV0() {
    setAutoPlanError(null);

    if (typeof window === "undefined") return;

    if (!targetWeights.length) {
      setAutoPlanError("Missing targetWeights. Please configure target weights first.");
      return;
    }

    const raw = String(autoPlanInputText ?? "").trim();
    if (!raw) {
      setAutoPlanError("Provide drift input (seriesBySymbol or snapshots). Tip: click Seed from current snapshot.");
      return;
    }

    const parsed = safeJsonParse(raw);
    if (!parsed.ok) {
      setAutoPlanError(parsed.error);
      return;
    }

    const seriesRes = tryBuildSeriesBySymbolForPlan(parsed.value);
    if (!seriesRes.ok) {
      setAutoPlanError(seriesRes.error);
      return;
    }

    const st = loadPortfolioStateV1();

    const holdingsMap: Record<string, number> = {};
    for (const [symRaw, p] of Object.entries(st.positions ?? {})) {
      const sym = normalizePlanSymbol(symRaw);
      if (!sym) continue;

      const qty = toFiniteNumber((p as any)?.qty);
      if (!qty || qty <= 0) continue;

      holdingsMap[sym] = qty;
    }

    const targetWeightsMap: Record<string, number> = {};
    for (const t of targetWeights) {
      const id = normalizePlanSymbol((t as any)?.id);
      const w = toFiniteNumber((t as any)?.targetPct);
      if (!id) continue;
      if (w === null || w < 0) continue;
      targetWeightsMap[id] = w;
    }

    const required = new Set<string>([...Object.keys(holdingsMap), ...Object.keys(targetWeightsMap)]);
    const missing = Array.from(required).filter((sym) => !(sym in seriesRes.seriesBySymbol));

    if (missing.length) {
      setAutoPlanError(
        `Missing symbols in series: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " ..." : ""}`,
      );
      return;
    }

    const mp: any = moneyPlan as any;
    const mpConstraints: any = mp?.constraints ?? {};

    const constraints: any = { minNotional: 0.01 };

    const maxPositionPct = toFiniteNumber(mpConstraints?.maxPositionPct);
    const maxIn = toFiniteNumber(mpConstraints?.maxIn);
    const maxOut = toFiniteNumber(mpConstraints?.maxOut);

    if (maxPositionPct !== null) constraints.maxPositionPct = maxPositionPct;
    if (maxIn !== null) constraints.maxIn = maxIn;
    if (maxOut !== null) constraints.maxOut = maxOut;

    const cash0 = toFiniteNumber((st as any)?.cash) ?? 0;

    try {
      const res = backtestDriftRebalance({
        seriesBySymbol: seriesRes.seriesBySymbol as any,
        targetWeights: targetWeightsMap,
        initialHoldings: holdingsMap,
        initialCash: cash0,
        constraints,
        policy: rebalancePolicy,
        bootstrapToTarget: false,
        includeEventStates: true,
      });

      setAutoPlanResult(res);
      saveJsonToLs(LS_AUTO_PLAN_RESULT, res);
    } catch (e) {
      setAutoPlanError(e instanceof Error ? e.message : String(e));
    }
  }


  async function runPaperRebalanceCore() {
    setPaperRunError(null);
    setPaperRunRecordedAt(null);
    setPaperRunSummary(null);
    setPaperRunPostSummary(null);
    setPaperRunHealthcheck(null);
    setPaperRunDriftAlert(null);

    if (typeof window === 'undefined') return;

    const mode: ExecutionModeV0 = executionMode;
    setPaperRunExecutionMode(mode);

    // Funds hub v0 safety: "live" execution is intentionally disabled until a broker adapter exists.
    // If a user has stale localStorage pointing to "live", force them back to dry run.
    if (mode === 'live') {
      setPaperRunError('Live execution is not configured yet. Please switch to Dry run.');
      persistExecutionModeV0('paper');
      setPaperRunExecutionMode('paper');
      return;
    }

    if (preTradeCashCheck.blocking) {
      // Conservative UX: treat insufficient settled cash as a pre-trade blocker.
      setPaperRunError(preTradeCashCheck.message);
      return;
    }

    setPaperRunLoading(true);

    paperRunAbortRef.current?.abort();
    const controller = new AbortController();
    paperRunAbortRef.current = controller;

    // Pre-compute drift breaches so the UI shows an immediate "live" alert even if the core route is slow.
    setPaperRunDriftAlert(
      computeDriftAlertFromTableRows({ at: new Date().toISOString(), rows: rebalanceTableRows, thresholdPct: driftThresholdPct })
    );

    try {
      const st = loadPortfolioStateV1();

      const mp: any = moneyPlan as any;
      const baseCcy = typeof mp?.account?.baseCcy === 'string' ? String(mp.account.baseCcy) : '';
      const mpConstraints: any = mp?.constraints ?? {};

      const constraints: any = { minNotional: 0.01 };
      const maxPositionPct = toFiniteNumber(mpConstraints?.maxPositionPct);
      const maxIn = toFiniteNumber(mpConstraints?.maxIn);
      const maxOut = toFiniteNumber(mpConstraints?.maxOut);
      if (maxPositionPct !== null) constraints.maxPositionPct = maxPositionPct;
      if (maxIn !== null) constraints.maxIn = maxIn;
      if (maxOut !== null) constraints.maxOut = maxOut;

      const holdingsMap: Record<string, number> = {};
      for (const [symRaw, p] of Object.entries(st.positions ?? {})) {
        const sym = String(symRaw ?? '').trim();
        if (!sym) continue;

        const qty = toFiniteNumber((p as any)?.qty);
        if (!qty || qty <= 0) continue;
        holdingsMap[sym] = qty;
      }

      const byCode = new Map<string, FundLike>();
      for (const f of funds ?? []) {
        const code = String(f?.code ?? '').trim();
        if (code) byCode.set(code, f);
      }

      const pricesMap: Record<string, number> = {};
      const symbols = new Set<string>([...Object.keys(holdingsMap), ...targetWeights.map((t) => t.id)]);

      for (const sym of symbols) {
        const manual = getSnapshotPrice(priceSnapshot, sym);
        const nav = manual ?? pickFundNav(byCode.get(sym));
        if (nav && nav > 0) pricesMap[sym] = nav;
      }

      const valuesBySymbol: Record<string, number> = {};
      for (const [sym, qty] of Object.entries(holdingsMap)) {
        const px = toFiniteNumber((pricesMap as any)[sym]);
        if (px === null || px <= 0) continue;
        valuesBySymbol[sym] = qty * px;
      }

      // "Expected" = what the user sees in the preview (effectiveOrders + preview targetWeights).
      // "Actual" will be computed after we get the core response orders/weights.
      const expectedSummary: RebalancePostRunSummaryV0 | null = (() => {
        try {
          return buildRebalancePostRunSummaryV0({
            cashStart: toFiniteNumber((st as any)?.cash) ?? 0,
            valuesBySymbol,
            targetWeightsBySymbol: whatIfTargetWeightsPostBySymbol,
            orders: effectiveOrders,
            feeBps: whatIfFeeBps,
            slippageBps: whatIfSlippageBpsUsed,
            labelsBySymbol: whatIfLabelsBySymbol,
          });
        } catch {
          return null;
        }
      })();

      const basePolicy = loadRebalancePolicyV1();
      const policy = {
        ...basePolicy,
        lastRebalanceAt: st.lastRebalance?.at,
        now: new Date().toISOString(),
      };

      const account: any = { cash: st.cash };
      if (baseCcy) account.baseCcy = baseCcy;

      const req = {
        account,
        constraints,
        policy,
        holdings: holdingsMap,
        prices: pricesMap,
        targetWeights,
      };

      saveJsonToLs(LS_REBALANCE_REQUEST, req);

      // Core is deterministic and runs in-process (Next.js route), so this stays fast.
      const res = await fetch('/api/daa/rebalance/core', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      const text = await res.text();
      const parsed = safeJsonParse(text);
      const respValue = parsed.ok ? parsed.value : { raw: text };

      saveJsonToLs(LS_REBALANCE_RESPONSE, respValue);

      if (!res.ok) {
        setPaperRunError(`HTTP ${res.status}`);
        return;
      }

      if (!parsed.ok) {
        setPaperRunError('response JSON parse failed');
        return;
      }

      const resp: any = respValue as any;

      // Surface core-level drift/trigger info as a compact alert for fast feedback during runs.
      setPaperRunDriftAlert(computeDriftAlertFromCoreResponse({ at: new Date().toISOString(), resp, fallbackThresholdPct: driftThresholdPct }));

      const orders = Array.isArray(resp?.orders) ? resp.orders : [];
      const shouldRebalance = !!resp?.trigger?.shouldRebalance;

      if (!shouldRebalance) {
        setPaperRunSummary('触发策略: shouldRebalance=false（未记录）。');
        return;
      }

      if (!orders.length) {
        setPaperRunSummary('未返回 orders（未记录）。');
        return;
      }

      const coreCashCheck = getPreTradeCashCheckV0({
        cashStart: st.cash,
        orders,
        feeBps: whatIfFeeBps,
        slippageBps: whatIfSlippageBpsUsed,
        baseCcy: baseCcy || null,
      });

      if (coreCashCheck.blocking) {
        setPaperRunError(coreCashCheck.message);
        return;
      }

      const runNote = 'ui:market/funds:dry-run';
      const exec = getExecutionAdapterV0('paper');
      const r = exec.executeOrders({
        storage: window.localStorage,
        source: 'rebalance-core',
        orders,
        note: runNote,
      });

      if (!r.ok) {
        setPaperRunError(r.error);
        return;
      }

      setPaperRunRecordedAt(r.entry.at);
      setPaperRunSummary(`已记录 Dry run（不发送真实订单）：${orders.length} 条 orders。`);

      const actualSummary: RebalancePostRunSummaryV0 | null = (() => {
        try {
          const targetWeightsBySymbol: Record<string, number> = {};

          // Start with preview labels so tables stay readable even when core omits labels.
          const labelsBySymbol: Record<string, string> = { ...(whatIfLabelsBySymbol ?? {}) };

          const twArr = Array.isArray(resp?.targetWeights) ? (resp.targetWeights as any[]) : [];
          if (twArr.length) {
            for (const t of twArr) {
              const id = String((t as any)?.id ?? '').trim();
              if (!id) continue;
              const w = toFiniteNumber((t as any)?.targetPct);
              if (w === null) continue;
              targetWeightsBySymbol[id] = w;

              const label = String((t as any)?.label ?? id).trim();
              if (label) labelsBySymbol[id] = label;
            }
          } else {
            // Fallback (shouldn't happen for core): use the request targetWeights.
            for (const t of targetWeights) {
              const id = String((t as any)?.id ?? '').trim();
              if (!id) continue;
              const w = toFiniteNumber((t as any)?.targetPct);
              if (w === null) continue;
              targetWeightsBySymbol[id] = w;
              labelsBySymbol[id] = String((t as any)?.label ?? id);
            }
          }

          for (const f of funds ?? []) {
            const code = String((f as any)?.code ?? '').trim();
            const name = String((f as any)?.name ?? '').trim();
            if (code && name) labelsBySymbol[code] = name;
          }

          return buildRebalancePostRunSummaryV0({
            cashStart: toFiniteNumber((st as any)?.cash) ?? 0,
            valuesBySymbol,
            targetWeightsBySymbol,
            orders,
            feeBps: whatIfFeeBps,
            slippageBps: whatIfSlippageBpsUsed,
            labelsBySymbol,
          });
        } catch {
          return null;
        }
      })();

      if (actualSummary) setPaperRunPostSummary(actualSummary);

      // Compare the preview (expected) vs core run (actual) to make mismatches obvious.
      const notes: string[] = [];
      let pass: boolean | null = null;

      if (!expectedSummary) notes.push('missing expected (preview) metrics');
      if (!actualSummary) notes.push('missing actual (core) metrics');

      if (expectedSummary && actualSummary) {
        const turnoverDiff = Math.abs(actualSummary.turnoverNotional - expectedSummary.turnoverNotional);
        const turnoverTol = Math.max(1, Math.abs(expectedSummary.turnoverNotional) * 0.01); // 1% or 1 base unit

        const driftExp = expectedSummary.maxAbsDriftAfterPct01;
        const driftAct = actualSummary.maxAbsDriftAfterPct01;
        const driftDiff = driftExp !== null && driftAct !== null ? Math.abs(driftAct - driftExp) : Number.POSITIVE_INFINITY;
        const driftTol = 0.001; // 10 bps

        pass = turnoverDiff <= turnoverTol && driftDiff <= driftTol;

        if (turnoverDiff > turnoverTol) {
          notes.push(`turnover mismatch: diff=${turnoverDiff.toFixed(2)} > tol=${turnoverTol.toFixed(2)}`);
        }

        if (driftDiff > driftTol) {
          notes.push(`post-drift mismatch: diff=${fmtPct01(driftDiff)} > tol=${fmtPct01(driftTol)}`);
        }

        if (expectedSummary.ordersCount !== actualSummary.ordersCount) {
          notes.push(`ordersCount mismatch: expected=${expectedSummary.ordersCount} vs actual=${actualSummary.ordersCount}`);
        }
      }

      setPaperRunHealthcheck({ expected: expectedSummary, actual: actualSummary, pass, notes });

      // Record the latest run in the portfolio store so cooldown debouncing can work.
      recordPortfolioLastRebalance({ kind: 'core', request: req, response: respValue, logNote: runNote });
    } catch (e) {
      const isAbort =
        typeof e === 'object' &&
        e !== null &&
        'name' in e &&
        (e as any).name === 'AbortError';

      if (isAbort) {
        setPaperRunSummary('已取消（abort）。');
      } else {
        setPaperRunError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      paperRunAbortRef.current = null;
      setPaperRunLoading(false);
    }
  }

  return (
    <div id="daa-panel" className="col-12 glass card" role="region" aria-label="DAA Workflow 面板">
      <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' as const }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
          <span style={{ fontWeight: 800 }}>DAA Workflow</span>
          <span className="muted" style={{ fontSize: 12 }}>
            Hub on Market/Funds: checklist + jump actions + import/export
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <Link href="/daa/dashboard" className="muted" style={{ fontSize: 12 }}>
            Dashboard
          </Link>
          <Link href="/daa?step=1" className="muted" style={{ fontSize: 12 }}>
            Wizard
          </Link>
          <button type="button" className="button secondary" onClick={() => jumpTo(nextJump.targetId)} style={{ padding: '6px 10px' }}>
            {nextJump.buttonText}
          </button>
          <button type="button" className="button secondary" onClick={applySampleScenarioV0} style={{ padding: '6px 10px' }}>
            {sampleStatus === 'ok' ? 'Loaded' : sampleStatus === 'error' ? 'Load failed' : 'Load sample scenario'}
          </button>
          <button type="button" className="button" onClick={doCopyBundle} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy bundle JSON'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen((v) => !v)}
            style={{ padding: '6px 10px' }}
            aria-expanded={open}
          >
            {open ? '收起' : '展开'}
          </button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: open ? 12 : 0 }}>
        <div>{headline}</div>
        <div style={{ marginTop: 4 }}>{step1SummaryText}</div>
      </div>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div id="portfolio" style={{ scrollMarginTop: 12 }}>
            <DaaPortfolioEditorV0 />
          </div>

          <div id="prices" style={{ scrollMarginTop: 12 }}>
            <DaaPriceSnapshotInputV0 />
          </div>

          <div id="target-weights" style={{ scrollMarginTop: 12 }}>
            <DaaTargetWeightsEditorV0 />
          </div>

          <div id="policy" style={{ scrollMarginTop: 12 }}>
            <DaaRebalancePolicyEditorV0 />
          </div>

          <div id="rebalance" style={{ scrollMarginTop: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ fontWeight: 800 }}>Rebalance v0</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" onClick={doCopyWeights} style={{ padding: '6px 10px' }}>
                  {copyWeightsStatus === 'ok' ? 'Copied' : copyWeightsStatus === 'error' ? 'Copy failed' : 'Copy current vs target'}
                </button>
                <button type="button" className="button" onClick={doCopyOrders} style={{ padding: '6px 10px' }} disabled={!effectiveOrders.length}>
                  {copyOrdersStatus === 'ok' ? 'Copied' : copyOrdersStatus === 'error' ? 'Copy failed' : 'Copy suggested orders'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Mode:
                  </span>
                  <select
                    value={executionMode}
                    onChange={(e) => persistExecutionModeV0(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 10 }}
                    aria-label="Rebalance execution mode"
                  >
                    <option value="paper">Dry run (no orders sent)</option>
                    <option value="live" disabled>
                      Live (real orders) — not configured
                    </option>
                  </select>
                  <span className="muted" style={{ fontSize: 11 }}>
                    Dry run only records the orders to the local execution log.
                  </span>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={runPaperRebalanceCore}
                  style={{ padding: '6px 10px' }}
                  disabled={paperRunLoading || !targetWeights.length || preTradeCashCheck.blocking}
                  title={preTradeCashCheck.blocking ? preTradeCashCheck.message : undefined}
                >
                  {paperRunLoading ? 'Running...' : executionMode === 'live' ? 'Run rebalance (live)' : 'Run rebalance (dry run)'}
                </button>
                {paperRunLoading ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => paperRunAbortRef.current?.abort()}
                    style={{ padding: '6px 10px' }}
                  >
                    Cancel
                  </button>
                ) : null}
                <Link href="/daa?step=3" className="muted" style={{ fontSize: 12 }}>
                  Edit money plan
                </Link>
                <Link href="/daa?step=4" className="muted" style={{ fontSize: 12 }}>
                  Run recommendation
                </Link>
              </div>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Current = holdings × (manual price or estGsz/gsz/dwjz) + cash; Target = manual targetWeights (if configured) else engine targetWeights/money_plan.allocations; Orders = engine orders or naive diff.
              <span style={{ marginLeft: 6 }}>
                targetWeights source:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{targetWeightsSource}</span>
              </span>
            </div>

            {portfolioLastRebalanceAt ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                portfolioState.lastRebalance.at:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{portfolioLastRebalanceAt}</span>
              </div>
            ) : null}

            {effectiveOrders.length ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  border: preTradeCashCheck.blocking ? '1px solid rgba(176, 0, 32, 0.5)' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  background: preTradeCashCheck.blocking ? 'rgba(176, 0, 32, 0.08)' : 'rgba(0,0,0,0.10)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: preTradeCashCheck.blocking ? 'var(--danger)' : 'var(--muted)' }}>
                  Pre-trade cash/settlement check {preTradeCashCheck.blocking ? '(BLOCKED)' : '(ok)'}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                  cashStart=<b>{preTradeCashCheck.cashStart.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
                  {' '}· buy=<b>{preTradeCashCheck.buyNotional.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
                  {' '}· sell=<b>{preTradeCashCheck.sellNotional.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
                  {' '}· cashAfter≈<b>{preTradeCashCheck.cashAfter.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
                </div>
                {preTradeCashCheck.blocking ? (
                  <div style={{ fontSize: 11, marginTop: 6, color: 'var(--danger)' }}>{preTradeCashCheck.message}</div>
                ) : (
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Assumption: sell proceeds may settle later (T+1/T+2), so BUY notional must be covered by starting cash.
                  </div>
                )}
              </div>
            ) : null}

            {paperRunRecordedAt ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  border: '1px solid rgba(0, 170, 119, 0.35)',
                  borderRadius: 12,
                  background: 'rgba(0, 170, 119, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>
                    Execution recorded ({paperRunExecutionMode === 'live' ? 'live' : 'dry-run'})
                    <span className="muted" style={{ marginLeft: 8, fontWeight: 500, fontFamily: 'ui-monospace, SFMono-Regular' }}>{paperRunRecordedAt}</span>
                  </div>
                  <button type="button" className="button secondary" onClick={() => scrollToId('rebalance-log')} style={{ padding: '6px 10px' }}>
                    Next: view log
                  </button>
                </div>

                {paperRunPostSummary && paperRunPostSummary.targetFillPct01 !== null ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Target fill: <b>{(paperRunPostSummary.targetFillPct01 * 100).toFixed(0)}%</b>
                    {paperRunPostSummary.sumAbsDriftBeforePct01 !== null && paperRunPostSummary.sumAbsDriftAfterPct01 !== null ? (
                      <>
                        {' '}· Σ|drift|: {(paperRunPostSummary.sumAbsDriftBeforePct01 * 100).toFixed(1)}% → {(paperRunPostSummary.sumAbsDriftAfterPct01 * 100).toFixed(1)}%
                      </>
                    ) : null}
                    {paperRunPostSummary.maxAbsDriftBeforePct01 !== null && paperRunPostSummary.maxAbsDriftAfterPct01 !== null ? (
                      <>
                        {' '}· max|drift|: {(paperRunPostSummary.maxAbsDriftBeforePct01 * 100).toFixed(1)}% → {(paperRunPostSummary.maxAbsDriftAfterPct01 * 100).toFixed(1)}%
                      </>
                    ) : null}
                    {' '}· orders: <b>{paperRunPostSummary.ordersCount}</b>
                  </div>
                ) : paperRunSummary ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{paperRunSummary}</div>
                ) : null}

                {paperRunPostSummary?.warnings?.length ? (
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    What-if warnings: {paperRunPostSummary.warnings.slice(0, 2).join('; ')}
                  </div>
                ) : null}

                {paperRunHealthcheck ? (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>Post-run healthcheck</div>
                      {paperRunHealthcheck.pass !== null ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: paperRunHealthcheck.pass ? '#0a7' : '#b00020',
                            color: '#fff',
                          }}
                        >
                          {paperRunHealthcheck.pass ? 'PASS' : 'FAIL'}
                        </span>
                      ) : null}
                    </div>

                    {paperRunHealthcheck.expected && paperRunHealthcheck.actual ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Expected (preview) vs Actual (core)
                        {' '}· turnover: exp <b>{paperRunHealthcheck.expected.turnoverNotional.toFixed(2)}</b>
                        {paperRunHealthcheck.expected.turnoverPctOfTotalBefore01 !== null ? (
                          <> ({fmtPct01(paperRunHealthcheck.expected.turnoverPctOfTotalBefore01)})</>
                        ) : null}
                        {' '}· act <b>{paperRunHealthcheck.actual.turnoverNotional.toFixed(2)}</b>
                        {paperRunHealthcheck.actual.turnoverPctOfTotalBefore01 !== null ? (
                          <> ({fmtPct01(paperRunHealthcheck.actual.turnoverPctOfTotalBefore01)})</>
                        ) : null}
                        {' '}· max|drift| after: exp <b>{paperRunHealthcheck.expected.maxAbsDriftAfterPct01 !== null ? fmtPct01(paperRunHealthcheck.expected.maxAbsDriftAfterPct01) : 'n/a'}</b>
                        {' '}· act <b>{paperRunHealthcheck.actual.maxAbsDriftAfterPct01 !== null ? fmtPct01(paperRunHealthcheck.actual.maxAbsDriftAfterPct01) : 'n/a'}</b>
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Expected/Actual metrics missing.
                      </div>
                    )}

                    {paperRunHealthcheck.notes.length ? (
                      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                        Notes: {paperRunHealthcheck.notes.join(' | ')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : paperRunError ? (
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--danger)' }}>{paperRunError}</div>
            ) : paperRunSummary ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{paperRunSummary}</div>
            ) : null}

            {paperRunDriftAlert ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.12)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: paperRunDriftAlert.breached ? 'var(--danger)' : 'var(--muted)' }}>
                    Live drift alerts
                    {paperRunLoading ? <span className="muted" style={{ marginLeft: 6, fontWeight: 500 }}>(running...)</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                    {paperRunDriftAlert.source} @ {paperRunDriftAlert.at}
                  </div>
                </div>

                <div style={{ marginTop: 4, fontSize: 12, color: paperRunDriftAlert.breached ? 'var(--danger)' : 'var(--text)' }}>
                  maxAbsDrift={fmtPct01(paperRunDriftAlert.maxAbsDriftPct)}
                  {paperRunDriftAlert.maxAbsDriftSymbol ? ` (${paperRunDriftAlert.maxAbsDriftSymbol})` : ''}; threshold={fmtPct01(paperRunDriftAlert.thresholdPct)}
                  {paperRunDriftAlert.shouldRebalance !== undefined ? `; shouldRebalance=${String(paperRunDriftAlert.shouldRebalance)}` : ''}
                </div>

                {paperRunDriftAlert.breaches.length ? (
                  <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                    Breaches:{' '}
                    {paperRunDriftAlert.breaches
                      .map((b) => `${b.label}(${b.id}) ${b.driftPct >= 0 ? '+' : ''}${(b.driftPct * 100).toFixed(1)}%`)
                      .join(' · ')}
                  </div>
                ) : (
                  <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>No symbols exceed the drift threshold.</div>
                )}

                {paperRunDriftAlert.reasons?.length ? (
                  <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                    Trigger: {paperRunDriftAlert.reasons.slice(0, 3).join('; ')}
                    {paperRunDriftAlert.eligibleOrderCount !== undefined ? `; eligibleOrders=${paperRunDriftAlert.eligibleOrderCount}` : ''}
                  </div>
                ) : null}
              </div>
            ) : null}

            {rebalanceTableRows.length ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Quick filters:</span>
                  <button
                    type="button"
                    className={driftFilter === 'all' ? 'button' : 'button secondary'}
                    onClick={() => setDriftFilter('all')}
                    style={{ padding: '4px 8px' }}
                    aria-pressed={driftFilter === 'all'}
                  >
                    All <span className="muted">({driftCounts.total})</span>
                  </button>
                  <button
                    type="button"
                    className={driftFilter === 'over' ? 'button' : 'button secondary'}
                    onClick={() => setDriftFilter('over')}
                    style={{ padding: '4px 8px' }}
                    aria-pressed={driftFilter === 'over'}
                    disabled={!driftCounts.over}
                  >
                    Over target <span className="muted">({driftCounts.over})</span>
                  </button>
                  <button
                    type="button"
                    className={driftFilter === 'under' ? 'button' : 'button secondary'}
                    onClick={() => setDriftFilter('under')}
                    style={{ padding: '4px 8px' }}
                    aria-pressed={driftFilter === 'under'}
                    disabled={!driftCounts.under}
                  >
                    Under target <span className="muted">({driftCounts.under})</span>
                  </button>
                  <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>
                    threshold={(driftThresholdPct * 100).toFixed(2)}%
                  </span>
                </div>

                {filteredRebalanceTableRows.length ? (
                  <div style={{ overflowX: 'auto' as const }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Asset</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Current</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Target</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRebalanceTableRows.map((r) => {
                          const delta = r.deltaPct;
                          const kind = delta >= driftThresholdPct ? 'over' : delta <= -driftThresholdPct ? 'under' : 'ok';
                          const driftAbsPct = (Math.abs(delta) * 100).toFixed(1);
                          const badgeText = kind === 'over' ? `OVER +${driftAbsPct}%` : kind === 'under' ? `UNDER -${driftAbsPct}%` : `OK ${driftAbsPct}%`;
                          const badgeColor = kind === 'over' ? 'var(--danger)' : kind === 'under' ? 'var(--primary)' : 'var(--muted)';
                          const color = kind === 'over' ? 'var(--danger)' : kind === 'under' ? 'var(--primary)' : 'var(--text)';

                          return (
                            <tr key={r.id}>
                              <td style={{ padding: '6px 0' }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                                  <span>
                                    {r.label} <span className="muted">({r.id})</span>
                                  </span>
                                  <span
                                    className="badge"
                                    style={{ padding: '2px 8px', fontSize: 11, borderColor: badgeColor, color: badgeColor, background: 'rgba(0,0,0,0.12)' }}
                                    title={`drift ${(delta * 100).toFixed(2)}% vs target`}
                                  >
                                    {badgeText}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.currentPct * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.targetPct * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color }}>{(delta * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    No rows match the current filter.
                  </div>
                )}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                数据不足：请先在 Market/Funds 录入持仓/价格，并配置 Step3 money plan 或先跑一次 Step4 recommendation。
              </div>
            )}

            <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              {effectiveOrders.length ? (
                <div>
                  <OrdersReviewV0
                    title="Orders review (v0)"
                    orders={effectiveOrders}
                    cashStart={portfolioCash}
                    minTradeNotional={rebalancePolicy.minTradeNotional}
                    ccy={baseCcy}
                  />

                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Source: {engineOrders.length ? 'engine orders (last run)' : 'naive diff orders'}.
                  </div>

                  {whatIf ? (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>What-if preview (fees/slippage + expected drift)</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        Costs model (v0): BUY acquires (notional - cost); SELL receives (notional - cost); cost = feeBps + slippage/spreadBps(base) * sensitivity.
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginTop: 8, alignItems: 'center' }}>
                        <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                          brokerageFeeBps
                          <input
                            type="number"
                            value={whatIfFeeBps}
                            min={0}
                            step={1}
                            onChange={(e) => setWhatIfFeeBps(Number(e.target.value))}
                            style={{ width: 90, padding: '4px 6px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}
                          />
                        </label>

                        <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                          slippage/spreadBps (base)
                          <input
                            type="number"
                            value={whatIfSlippageBps}
                            min={0}
                            step={1}
                            onChange={(e) => setWhatIfSlippageBps(Number(e.target.value))}
                            style={{ width: 90, padding: '4px 6px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}
                          />
                        </label>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                          <div className="muted" style={{ fontSize: 12 }}>
                            sensitivity
                          </div>

                          {(['LOW', 'BASE', 'HIGH'] as const).map((k) => {
                            const active = whatIfSlippageSensitivityV0 === k;
                            const mult = SLIPPAGE_SENSITIVITY_MULTIPLIER_V0[k];
                            const label = k === 'LOW' ? `Low (${mult}x)` : k === 'BASE' ? `Base (${mult}x)` : `High (${mult}x)`;

                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => setWhatIfSlippageSensitivityV0(k)}
                                className="badge"
                                style={{
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  borderColor: active ? 'var(--text)' : 'rgba(255,255,255,0.18)',
                                  color: active ? 'var(--text)' : 'var(--muted)',
                                  background: active ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)',
                                  cursor: 'pointer',
                                }}
                                title={`effectiveSlippageBps = base * ${mult}`}
                              >
                                {label}
                              </button>
                            );
                          })}

                          <div className="muted" style={{ fontSize: 12 }}>
                            effective={whatIfSlippageBpsUsed.toFixed(1)} bps
                          </div>
                        </div>

                        {(() => {
                          const ccy = baseCcy ? ` ${baseCcy}` : '';
                          const netImpact = whatIf.totalAfter - whatIf.totalBefore;
                          const netImpactPct = whatIf.totalBefore > 0 ? netImpact / whatIf.totalBefore : null;
                          const netColor = netImpact < 0 ? 'var(--danger)' : 'var(--text)';

                          return (
                            <>
                              <div className="muted" style={{ fontSize: 12 }}>
                                turnover={whatIf.turnoverNotional.toFixed(2)}{ccy} ({(whatIf.turnoverPctOfTotalBefore * 100).toFixed(2)}% of totalBefore)
                              </div>

                              <div className="muted" style={{ fontSize: 12 }}>
                                brokerageFee≈{whatIf.feeTotal.toFixed(2)}{ccy}; slippage≈{whatIf.slippageTotal.toFixed(2)}{ccy}
                              </div>

                              <div className="muted" style={{ fontSize: 12 }}>
                                totalCost≈{whatIf.costTotal.toFixed(2)}{ccy} (costPct={(whatIf.costPct * 100).toFixed(2)}%)
                              </div>

                              <div style={{ fontSize: 12, color: netColor }}>
                                netImpact={netImpact.toFixed(2)}{ccy}
                                {netImpactPct !== null ? ` (${(netImpactPct * 100).toFixed(2)}%)` : ''}
                                <span className="muted">{' '}= totalAfter - totalBefore</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {whatIf.warnings.length ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                          {whatIf.warnings.join('; ')}
                        </div>
                      ) : null}

                      <details className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                        <summary style={{ cursor: 'pointer' }}>Raw totals</summary>
                        <div style={{ marginTop: 6 }}>
                          buy={whatIf.buyNotional.toFixed(2)}; sell={whatIf.sellNotional.toFixed(2)}; totalBefore={whatIf.totalBefore.toFixed(2)}{baseCcy ? ` ${baseCcy}` : ''}; totalAfter={whatIf.totalAfter.toFixed(2)}{baseCcy ? ` ${baseCcy}` : ''}; cashAfter={whatIf.cashAfter.toFixed(2)}{baseCcy ? ` ${baseCcy}` : ''}.
                        </div>
                      </details>

                      <div style={{ marginTop: 10, overflowX: 'auto' as const }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Asset</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Current</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Post</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Target(pre)</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Target(post)</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Drift</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Value(after)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {whatIfRows.map((r) => {
                              const drift = r.driftPct;
                              const kind = drift >= driftThresholdPct ? 'over' : drift <= -driftThresholdPct ? 'under' : 'ok';
                              const driftAbsPct = (Math.abs(drift) * 100).toFixed(1);
                              const badgeText = kind === 'over' ? `OVER +${driftAbsPct}%` : kind === 'under' ? `UNDER -${driftAbsPct}%` : `OK ${driftAbsPct}%`;
                              const badgeColor = kind === 'over' ? 'var(--danger)' : kind === 'under' ? 'var(--primary)' : 'var(--muted)';
                              // Color is encoded in the drift badge.
                              return (
                                <tr key={r.id} style={{ opacity: r.id === 'CASH' ? 0.9 : 1 }}>
                                  <td style={{ padding: '6px 0' }}>
                                    {r.label} <span className="muted">({r.id})</span>
                                  </td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.currentPct * 100).toFixed(1)}%</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.postPct * 100).toFixed(1)}%</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.targetPrePct * 100).toFixed(1)}%</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.targetPct * 100).toFixed(1)}%</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                    <span
                                      className="badge"
                                      style={{ padding: '2px 8px', fontSize: 11, borderColor: badgeColor, color: badgeColor, background: 'rgba(0,0,0,0.12)' }}
                                      title={`drift ${(drift * 100).toFixed(2)}% vs target(post)`}
                                    >
                                      {badgeText}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{r.valueAfter.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  暂无 orders：请先跑一次 Step4，或确保 current vs target 数据齐全。（minTradeNotional={rebalancePolicy.minTradeNotional.toFixed(2)}）
                </div>
              )}
            </div>
          </div>

          <div
            id="auto-plan"
            style={{
              scrollMarginTop: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" as const }}>
              <div style={{ fontWeight: 800 }}>Auto plan v0</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                <button type="button" className="button secondary" onClick={seedAutoPlanFromCurrentSnapshotV0} style={{ padding: "6px 10px" }}>
                  Seed from current snapshot
                </button>
                <button type="button" className="button secondary" onClick={runAutoPlanV0} style={{ padding: "6px 10px" }}>
                  Generate plan
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={doCopyAutoPlanV0}
                  style={{ padding: "6px 10px" }}
                  disabled={!autoPlanResult}
                >
                  {autoPlanCopyStatus === "ok" ? "Copied" : autoPlanCopyStatus === "error" ? "Copy failed" : "Copy plan (md)"}
                </button>
              </div>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              One-click dynamic plan generator: drift (price series) -&gt; trigger policy -&gt; orders, with a preview weight diff. This is a
              deterministic simulation (paper only); it does not execute or record orders.
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <textarea
                value={autoPlanInputText}
                onChange={(e) => setAutoPlanInputText(e.target.value)}
                rows={8}
                placeholder={"Paste {seriesBySymbol: {...}} or {snapshots:[{date,prices}]}"}
                style={{
                  width: "100%",
                  fontFamily: "ui-monospace, SFMono-Regular",
                  fontSize: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(127,127,127,0.35)",
                  background: "rgba(0,0,0,0.12)",
                }}
              />

              {autoPlanError ? <div style={{ fontSize: 12, color: "var(--danger, #b00020)" }}>{autoPlanError}</div> : null}

              {autoPlanResult ? (
                <div style={{ marginTop: 6, padding: "10px 12px", border: "1px solid rgba(127,127,127,0.35)", borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" as const }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>Plan summary</div>
                    <div className="muted" style={{ fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular" }}>
                      schemaVersion={(autoPlanResult as any).schemaVersion}
                    </div>
                  </div>

                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    rebalanceCount=<b>{autoPlanResult.summary.rebalanceCount}</b>
                    {" "}· turnoverNotional=<b>{autoPlanResult.summary.turnoverNotional.toFixed(2)}</b>
                    {baseCcy ? ` ${baseCcy}` : ""}
                    {" "}· equityAbs: {autoPlanResult.summary.initialEquityAbs.toFixed(2)} → {autoPlanResult.summary.finalEquityAbs.toFixed(2)}
                  </div>

                  {autoPlanResult.states ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Overall diff (initial → final)</div>
                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                        {formatWeightsDiffLines({ before: autoPlanResult.states.initial, after: autoPlanResult.states.final }).join("\n")}
                      </pre>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>Events</div>

                    {autoPlanResult.events?.length ? (
                      <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                        {autoPlanResult.events.map((ev: any, idx: number) => {
                          const stats: any = ev?.trigger?.stats ?? {};
                          return (
                            <div
                              key={`${ev.kind}-${ev.date}-${idx}`}
                              style={{ padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" as const, alignItems: "baseline" }}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>
                                  {ev.kind} @ <span style={{ fontFamily: "ui-monospace, SFMono-Regular" }}>{ev.date}</span>
                                </div>
                                <div className="muted" style={{ fontSize: 11 }}>
                                  maxAbsDriftPct={fmtPct01(Number(stats.maxAbsDriftPct ?? NaN))}; maxAbsDriftSymbol={String(stats.maxAbsDriftSymbol ?? "")}
                                </div>
                              </div>

                              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                                shouldRebalance={String(!!ev?.trigger?.shouldRebalance)}; eligibleOrders={String(stats.eligibleOrderCount ?? "-")};
                                reasons={Array.isArray(ev?.trigger?.reasons) ? ev.trigger.reasons.slice(0, 2).join("; ") : ""}
                              </div>

                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Preview diff (before → after)</div>
                                <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                                  {formatWeightsDiffLines({ before: ev.before, after: ev.after }).join("\n")}
                                </pre>
                              </div>

                              <div style={{ marginTop: 10 }}>
                                <OrdersReviewV0
                                  title="Orders"
                                  orders={Array.isArray(ev?.orders) ? ev.orders : []}
                                  cashStart={typeof ev?.before?.cashAbs === "number" ? ev.before.cashAbs : null}
                                  minTradeNotional={rebalancePolicy.minTradeNotional}
                                  ccy={baseCcy}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No events.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>


          <div id="rebalance-log" style={{ scrollMarginTop: 12 }}>
            <DaaRebalanceLogViewV0 />
          </div>

          <div id="step1" style={{ scrollMarginTop: 12 }}>
            <Step1BacktestPage />
          </div>

          <DaaDashboardRunChecklist
            onJump={(id) => {
              scrollToId(id);
            }}
          />

          <div id="import" style={{ scrollMarginTop: 12 }}>
            <DaaDashboardImport />
          </div>

          <div id="export" style={{ scrollMarginTop: 12 }}>
            <DaaDashboardExport />
          </div>

          <div id="step2" style={{ scrollMarginTop: 12 }}>
            <Step2MarketEventsPage />
          </div>

          <div id="step4" style={{ scrollMarginTop: 12 }}>
            <Step4BaselineRecommendationPage />
          </div>

          {rt.hasRecommendation ? (
            <div id="step5" style={{ scrollMarginTop: 12 }}>
              <DaaDashboardAiExplain />
            </div>
          ) : (
            <div id="step5" style={{ scrollMarginTop: 12, fontSize: 12 }} className="muted">
              Step5 Explain：blocked，需先跑一次 Step4 recommendation。
            </div>
          )}

          <div id="step6" style={{ scrollMarginTop: 12 }}>
            <Step6HumanFactorPage />
          </div>

          <div id="step7" style={{ scrollMarginTop: 12 }}>
            <Step7TagsPage />
          </div>
        </div>
      ) : null}
    </div>
  );
}
