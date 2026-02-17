'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { pushDynamicRebalanceNotificationV0 } from '../../../dynamicRebalanceNotificationsClientV0';
import { LS_LEGACY_HOLDINGS, loadPortfolioStateV1, recordPortfolioLastRebalance, savePortfolioStateV1 } from '../../../portfolioStateStore';
import { getSnapshotPrice, loadPriceSnapshotV1, savePriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadTargetWeightsV1, persistTargetWeightsV1 } from '../../../targetWeightsStore';
import { loadRebalancePolicyV1 } from '../../../rebalancePolicyStore';
import { loadRebalanceScheduleStateV1, persistRebalanceScheduleV1 } from '../../../rebalanceScheduleStore';
import { loadExecutionModeV0, persistExecutionModeV0, type ExecutionModeV0 } from '../../../executionModeStore';
import { loadSellProceedsRoutingV0, persistSellProceedsRoutingV0 } from '../../../sellProceedsRoutingStoreV0';
import { loadCashBucketTargetPct01V0, persistCashBucketTargetPct01V0 } from '../../../cashBucketTargetStoreV0';
import { loadMaxTurnoverPct01V0, persistMaxTurnoverPct01V0 } from '../../../dynamicRebalanceGuardrailsStoreV0';
import { type SellProceedsRoutingV0 } from '@/src/daa/sellProceedsRoutingV0';
import { deriveInvestablePct01V0, scaleTargetWeightsByInvestablePct01V0 } from '@/src/daa/cashBucketTargetsV0';
import { OrdersReviewV0 } from '../../../_components/OrdersReviewV0';

import AllocationDiffChartV0 from './AllocationDiffChartV0';

import { simulateRebalanceWhatIfV0 } from '@/src/core/rebalanceWhatIf';
import { rebalanceCore, type RebalanceCoreRequest, type RebalanceCoreResponse } from '@/src/core/rebalanceCore';
import { backtestDriftRebalance, type DriftRebalanceBacktestResult } from '@/src/core/backtestDriftRebalance';
import { buildAutoPlanMarkdownV0 } from '@/src/core/autoPlanMarkdownV0';
import { coerceSeriesBySymbolInput, snapshotsToSeriesBySymbol } from '@/src/core/priceSnapshotsToSeries';
import { getExecutionAdapterV0 } from '@/src/daa/executionAdapterV0';
import { getPreTradeCashCheckV0 } from '@/src/daa/preTradeCashCheckV0';
import { appendRebalanceLog } from '@/src/daa/rebalanceLogStore';
import { buildRebalanceViolationsV0 } from '@/src/daa/rebalanceViolationsV0';
import { buildRebalanceApprovalSummaryMarkdownV0 } from '@/src/daa/rebalanceApprovalSummaryMarkdownV0';
import {
  attachOrdersToRebalanceRunV0,
  failRebalanceOrderStatusRunV0,
  finishRebalanceOrderStatusRunV0,
  startRebalanceOrderStatusRunV0,
  updateRebalanceOrderStatusV0} from '@/src/daa/rebalanceOrderStatusRunStoreV0';
import { buildRebalancePostRunSummaryV0, type RebalancePostRunSummaryV0 } from '@/src/daa/rebalancePostRunSummary';
import { buildRebalancePlanCsvV0 } from '@/src/daa/rebalancePlanCsvV0';
import { summarizeTradesForConfirmationV0 } from '@/src/daa/tradesSummaryV0';
import { estimateTaxLotsImpactV0 } from '@/src/daa/taxLotsImpactV0';
import { scrollToIdAndFocusV0 } from '@/src/daa/focusV0';
import { MARKET_FUNDS_QUICK_JUMPS_V0 } from '@/src/daa/keyboardFocusMapV0';
import { useDaaRuntime } from '../../../useDaaRuntime';
import { useDaaWorkflowExportBundleV1 } from '../../../useDaaWorkflowExportBundleV1';
import {
  DAA_FUNDS_HUB_REFRESH_MARKET_DONE_EVENT,
  DAA_FUNDS_HUB_REFRESH_MARKET_EVENT,
  DAA_FUNDS_HUB_RUN_RECOMMENDATION_DONE_EVENT,
  DAA_FUNDS_HUB_RUN_RECOMMENDATION_EVENT,
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
import Step3MoneyManagementPage from '../../../step/_pages/Step3MoneyManagementPage';
import Step4BaselineRecommendationPage from '../../../step/_pages/Step4BaselineRecommendationPage';
import Step6HumanFactorPage from '../../../step/_pages/Step6HumanFactorPage';
import Step7TagsPage from '../../../step/_pages/Step7TagsPage';

import DaaPortfolioEditorV0 from './DaaPortfolioEditorV0';
import DaaPriceSnapshotInputV0 from './DaaPriceSnapshotInputV0';
import DaaTargetWeightsEditorV0 from './DaaTargetWeightsEditorV0';
import DaaRebalancePolicyEditorV0 from './DaaRebalancePolicyEditorV0';
import DaaRebalanceScheduleV0 from './DaaRebalanceScheduleV0';
import DaaDynamicRebalanceStatusPillV0 from './DaaDynamicRebalanceStatusPillV0';
import DaaDynamicRebalancePausedReasonBannerV0 from './DaaDynamicRebalancePausedReasonBannerV0';
import DaaDynamicRebalanceLastOutcomeBannerV0 from './DaaDynamicRebalanceLastOutcomeBannerV0';
import DaaDynamicRebalanceSkipHistoryV0 from './DaaDynamicRebalanceSkipHistoryV0';
import DaaDynamicRebalanceNotificationWatcherV0 from './DaaDynamicRebalanceNotificationWatcherV0';
import DaaDynamicRebalanceNotificationsV0 from './DaaDynamicRebalanceNotificationsV0';
import DaaDynamicRebalanceRunHistoryV0 from './DaaDynamicRebalanceRunHistoryV0';
import DaaRebalanceLogViewV0 from './DaaRebalanceLogViewV0';
import DaaOkxSandboxBalancesV0 from './DaaOkxSandboxBalancesV0';
import { DaaRebalanceRunProgressV0 } from './DaaRebalanceRunProgressV0';
import { DaaDynamicRebalanceRunCompletionToastV0 } from './DaaDynamicRebalanceRunCompletionToastV0';
import { DaaOrderStatusTrackerV0 } from './DaaOrderStatusTrackerV0';

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
const LS_WHATIF_DRIFT_THRESHOLD_PCT_V0 = 'daa.whatif.driftThresholdPctV0';
const LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0 = 'daa.whatif.ordersPreviewSourceV0';
const LS_REBALANCE_ASSET_BLACKLIST_V0 = 'daa.rebalance.assetBlacklist.v0';

type SlippageSensitivityV0 = 'LOW' | 'BASE' | 'HIGH';

type OrdersPreviewSourceV0 = 'RECOMPUTE' | 'ENGINE_LAST_RUN';

const SLIPPAGE_SENSITIVITY_MULTIPLIER_V0: Record<SlippageSensitivityV0, number> = {
  LOW: 0.5,
  BASE: 1,
  HIGH: 2};
type AutoPlanScenarioKeyV0 = 'A' | 'B';

const LS_AUTO_PLAN_INPUT = 'daa.market.funds.autoPlan.input.v0';
// Legacy single-scenario key (kept for migration only).
const LS_AUTO_PLAN_RESULT = 'daa.market.funds.autoPlan.result.v0';
const LS_AUTO_PLAN_RESULT_A = 'daa.market.funds.autoPlan.result.A.v0';
const LS_AUTO_PLAN_RESULT_B = 'daa.market.funds.autoPlan.result.B.v0';

function scrollToId(id: string) {
  scrollToIdAndFocusV0(id);
}

function downloadTextAsFile(args: { filename: string; text: string; mime: string }) {
  try {
    const blob = new Blob([args.text], { type: args.mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = args.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Give the click a tick before cleanup.
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  } catch {
    // ignore
  }
}

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

type QuotePriceSourceV0 = 'estGsz' | 'gsz' | 'dwjz' | 'missing';

type EffectivePriceSourceV0 = 'manual' | QuotePriceSourceV0;

function pickFundQuotePriceV0(fund: FundLike | undefined): { price: number | null; source: QuotePriceSourceV0 } {
  if (!fund) return { price: null, source: 'missing' };

  const coverage = toFiniteNumber(fund.estPricedCoverage) ?? 0;
  if (coverage > 0.05) {
    const est = toFiniteNumber(fund.estGsz);
    if (est && est > 0) return { price: est, source: 'estGsz' };
  }

  const gsz = toFiniteNumber(fund.gsz);
  if (gsz && gsz > 0) return { price: gsz, source: 'gsz' };

  // dwjz = last close (yesterday's NAV) for funds.
  const dwjz = toFiniteNumber(fund.dwjz);
  if (dwjz && dwjz > 0) return { price: dwjz, source: 'dwjz' };

  return { price: null, source: 'missing' };
}

function resolveFundPriceV0(args: {
  symbol: string;
  snapshot: unknown;
  fund: FundLike | undefined;
}): { price: number | null; source: EffectivePriceSourceV0 } {
  const manual = getSnapshotPrice(args.snapshot as any, args.symbol);
  if (manual && manual > 0) return { price: manual, source: 'manual' };

  const quote = pickFundQuotePriceV0(args.fund);
  return { price: quote.price, source: quote.source };
}

function pickFundNav(fund: FundLike | undefined): number | null {
  return pickFundQuotePriceV0(fund).price;
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
      reason: o?.reason === undefined ? undefined : String(o?.reason)}))
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
          targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0)}))
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
      targetPct: Number(a?.targetPct ?? 0)}))
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
        targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0)}))
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
    ...rows].join('\n');
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
    breaches};
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
    reasons};
}

export function DaaRebalancePanel({ funds, holdings }: Props) {
  const rt = useDaaRuntime();
  const { exportBundle } = useDaaWorkflowExportBundleV1();

  // Funds hub shortest path: keep DAA Workflow expanded by default.
  const [open, setOpen] = useState(true);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyOrdersStatus, setCopyOrdersStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyWeightsStatus, setCopyWeightsStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyApprovalSummaryStatus, setCopyApprovalSummaryStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [sampleStatus, setSampleStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [runDaaStatus, setRunDaaStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [runDaaStatusText, setRunDaaStatusText] = useState<string>('');

  const [autoPlanScenario, setAutoPlanScenario] = useState<AutoPlanScenarioKeyV0>(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
    const active = saved && typeof saved === 'object' ? String((saved as any).active ?? '') : '';
    return active === 'B' ? 'B' : 'A';
  });

  const [autoPlanInputTextA, setAutoPlanInputTextA] = useState(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
    if (saved && typeof saved === 'object') {
      const a = (saved as any).a;
      if (a && typeof a === 'object' && typeof a.text === 'string') return String(a.text);
      if (typeof (saved as any).text === 'string') return String((saved as any).text); // legacy
    }
    return '';
  });

  const [autoPlanInputTextB, setAutoPlanInputTextB] = useState(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
    if (saved && typeof saved === 'object') {
      const b = (saved as any).b;
      if (b && typeof b === 'object' && typeof b.text === 'string') return String(b.text);
    }
    return '';
  });

  const [autoPlanThresholdOverridePctA, setAutoPlanThresholdOverridePctA] = useState<number | null>(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
    const n = saved && typeof saved === 'object' ? Number((saved as any)?.a?.thresholdPctOverride ?? Number.NaN) : Number.NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

  const [autoPlanThresholdOverridePctB, setAutoPlanThresholdOverridePctB] = useState<number | null>(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
    const n = saved && typeof saved === 'object' ? Number((saved as any)?.b?.thresholdPctOverride ?? Number.NaN) : Number.NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

  const [autoPlanResultA, setAutoPlanResultA] = useState<DriftRebalanceBacktestResult | null>(() => {
    const savedA = readJsonFromLs<any>(LS_AUTO_PLAN_RESULT_A);
    if (savedA && typeof savedA === 'object' && (savedA as any).schemaVersion === 1) return savedA as DriftRebalanceBacktestResult;

    const legacy = readJsonFromLs<any>(LS_AUTO_PLAN_RESULT);
    return legacy && typeof legacy === 'object' && (legacy as any).schemaVersion === 1 ? (legacy as any as DriftRebalanceBacktestResult) : null;
  });

  const [autoPlanResultB, setAutoPlanResultB] = useState<DriftRebalanceBacktestResult | null>(() => {
    const savedB = readJsonFromLs<any>(LS_AUTO_PLAN_RESULT_B);
    return savedB && typeof savedB === 'object' && (savedB as any).schemaVersion === 1 ? (savedB as any as DriftRebalanceBacktestResult) : null;
  });

  const [autoPlanErrorA, setAutoPlanErrorA] = useState<string | null>(null);
  const [autoPlanErrorB, setAutoPlanErrorB] = useState<string | null>(null);
  const [autoPlanCopyStatus, setAutoPlanCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [driftFilter, setDriftFilter] = useState<'all' | 'over' | 'under'>('all');

  const [rev, setRev] = useState(0);
  const executionMode: ExecutionModeV0 = useMemo(() => loadExecutionModeV0(), [rev]);
  const sellProceedsRoutingV0: SellProceedsRoutingV0 = useMemo(() => loadSellProceedsRoutingV0(), [rev]);
  const cashBucketTargetPct01 = useMemo(() => loadCashBucketTargetPct01V0(), [rev]);
  const maxTurnoverPct01V0 = useMemo(() => loadMaxTurnoverPct01V0(), [rev]);

  const [paperRunLoading, setPaperRunLoading] = useState(false);
  const [paperRunError, setPaperRunError] = useState<string | null>(null);
  const [paperRunRecordedAt, setPaperRunRecordedAt] = useState<string | null>(null);
  const [paperRunSummary, setPaperRunSummary] = useState<string | null>(null);
  const [paperRunPostSummary, setPaperRunPostSummary] = useState<RebalancePostRunSummaryV0 | null>(null);
  const [paperRunHealthcheck, setPaperRunHealthcheck] = useState<PaperRunHealthcheckV0 | null>(null);
  const [paperRunDriftAlert, setPaperRunDriftAlert] = useState<DriftAlertV0 | null>(null);
  const [paperRunExecutionMode, setPaperRunExecutionMode] = useState<ExecutionModeV0>("paper");
  const paperRunAbortRef = useRef<AbortController | null>(null);

  // When a run fails, keep enough context to show a useful error + allow one-click retry.
  const [paperRunLastConfirmedOpts, setPaperRunLastConfirmedOpts] = useState<{ cashSweep?: boolean } | null>(null);
  const [paperRunFailureDetails, setPaperRunFailureDetails] = useState<string | null>(null);

  // Preflight checklist (v0): confirm key safety/inputs before running a paper rebalance.
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightPendingOpts, setPreflightPendingOpts] = useState<{ cashSweep?: boolean } | null>(null);
  const [preflightAckPrices, setPreflightAckPrices] = useState(false);
  const [preflightAckConstraints, setPreflightAckConstraints] = useState(false);
  const [preflightAckCash, setPreflightAckCash] = useState(false);
  const [preflightOverrideBlockers, setPreflightOverrideBlockers] = useState(false);

  // Safety-stop confirmation (v0): last-step modal before executing a dynamic rebalance run.
  // Also offers a quick "kill switch" to disable the local dynamic schedule.
  const [safetyStopOpen, setSafetyStopOpen] = useState(false);
  const [safetyStopPendingOpts, setSafetyStopPendingOpts] = useState<{ cashSweep?: boolean } | null>(null);

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
    // Persist the latest drift input(s) so users can refresh and keep the plan editor state.
    saveJsonToLs(LS_AUTO_PLAN_INPUT, {
      schemaVersion: 2,
      active: autoPlanScenario,
      a: { text: autoPlanInputTextA, thresholdPctOverride: autoPlanThresholdOverridePctA },
      b: { text: autoPlanInputTextB, thresholdPctOverride: autoPlanThresholdOverridePctB }});
  }, [autoPlanScenario, autoPlanInputTextA, autoPlanInputTextB, autoPlanThresholdOverridePctA, autoPlanThresholdOverridePctB]);

  const moneyPlan = useMemo(() => readJsonFromLs(LS_MONEY_PLAN), [rev]);
  const rebalanceReq = useMemo(() => readJsonFromLs(LS_REBALANCE_REQUEST), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);

  const rebalancePolicy = useMemo(() => loadRebalancePolicyV1(), [rev]);

  const policyDriftThresholdPct = useMemo(() => {
    const t = toFiniteNumber((rebalancePolicy as any)?.thresholdPct);
    return t !== null && t > 0 ? t : 0.01;
  }, [rebalancePolicy]);

  const [whatIfDriftThresholdPctV0, setWhatIfDriftThresholdPctV0] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(LS_WHATIF_DRIFT_THRESHOLD_PCT_V0);
    const n = raw === null ? null : Number(raw);
    return n !== null && Number.isFinite(n) && n >= 0 ? n : null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (whatIfDriftThresholdPctV0 === null) window.localStorage.removeItem(LS_WHATIF_DRIFT_THRESHOLD_PCT_V0);
    else window.localStorage.setItem(LS_WHATIF_DRIFT_THRESHOLD_PCT_V0, String(whatIfDriftThresholdPctV0));
  }, [whatIfDriftThresholdPctV0]);

  // Use the same threshold for trigger policy, drift badges, and quick filters.
  // Users can override it in-place via the funds hub what-if slider.
  const driftThresholdPct = useMemo(() => {
    return whatIfDriftThresholdPctV0 !== null ? whatIfDriftThresholdPctV0 : policyDriftThresholdPct;
  }, [policyDriftThresholdPct, whatIfDriftThresholdPctV0]);

  const [assetBlacklistTextV0, setAssetBlacklistTextV0] = useState(() => {
    if (typeof window === 'undefined') return '';
    return String(window.localStorage.getItem(LS_REBALANCE_ASSET_BLACKLIST_V0) ?? '');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_REBALANCE_ASSET_BLACKLIST_V0, String(assetBlacklistTextV0 ?? ''));
  }, [assetBlacklistTextV0]);

  const assetBlacklistV0 = useMemo(() => {
    const raw = String(assetBlacklistTextV0 ?? '').trim();
    if (!raw) return [] as string[];

    const tokens = raw
      .split(/[\s,;]+/g)
      .map((x) => normalizePlanSymbol(x))
      .filter(Boolean);

    return Array.from(new Set(tokens)).sort();
  }, [assetBlacklistTextV0]);

  const assetBlacklistSetV0 = useMemo(() => new Set(assetBlacklistV0), [assetBlacklistV0]);

  const autoPlanInputText = autoPlanScenario === 'A' ? autoPlanInputTextA : autoPlanInputTextB;
  const autoPlanThresholdOverridePct = autoPlanScenario === 'A' ? autoPlanThresholdOverridePctA : autoPlanThresholdOverridePctB;
  const autoPlanThresholdPctUsed = autoPlanThresholdOverridePct !== null ? autoPlanThresholdOverridePct : driftThresholdPct;
  const autoPlanResult = autoPlanScenario === 'A' ? autoPlanResultA : autoPlanResultB;
  const autoPlanError = autoPlanScenario === 'A' ? autoPlanErrorA : autoPlanErrorB;

  function setAutoPlanInputTextForActive(text: string) {
    if (autoPlanScenario === 'A') setAutoPlanInputTextA(text);
    else setAutoPlanInputTextB(text);
  }

  function setAutoPlanThresholdOverridePctForActive(v: number | null) {
    if (autoPlanScenario === 'A') setAutoPlanThresholdOverridePctA(v);
    else setAutoPlanThresholdOverridePctB(v);
  }

  function setAutoPlanErrorForActive(err: string | null) {
    if (autoPlanScenario === 'A') setAutoPlanErrorA(err);
    else setAutoPlanErrorB(err);
  }

  function setAutoPlanResultForActive(res: DriftRebalanceBacktestResult | null) {
    if (autoPlanScenario === 'A') setAutoPlanResultA(res);
    else setAutoPlanResultB(res);
  }

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
        '007300': { share: 500, cost: 1.0 }};

      // Keep the legacy `holdings` key in sync so the Market/Funds page and older exports keep working.
      window.localStorage.setItem(LS_LEGACY_HOLDINGS, JSON.stringify(legacyHoldings));

      savePortfolioStateV1({
        schemaVersion: 1,
        updatedAt: at,
        cash: 1000,
        positions: {
          '005963': { qty: 1000, cost: 1.2 },
          '007300': { qty: 500, cost: 1.0 }}});

      savePriceSnapshotV1({
        schemaVersion: 1,
        updatedAt: at,
        prices: {
          '005963': { price: 1.234 },
          '007300': { price: 1.052 },
          '000001': { price: 1.4 }}});

      persistTargetWeightsV1([
        { id: '005963', label: '005963', targetPct: 0.4 },
        { id: '007300', label: '007300', targetPct: 0.3 },
        { id: '000001', label: '000001', targetPct: 0.3 }]);

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

  function waitForRunDaaStepV0(eventName: string, timeoutMs: number) {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      let finished = false;

      const onDone = (ev: Event) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        window.removeEventListener(eventName, onDone as EventListener);
        const detail = (ev as CustomEvent<{ ok: boolean; error?: string }>).detail;
        resolve(detail && typeof detail === 'object' ? detail : { ok: true });
      };

      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        window.removeEventListener(eventName, onDone as EventListener);
        resolve({ ok: false, error: 'timeout' });
      }, timeoutMs);

      window.addEventListener(eventName, onDone as EventListener);
    });
  }

  async function runDaaRefreshAndRecommendationV0() {
    if (runDaaStatus === 'running') return;

    setOpen(true);
    setRunDaaStatus('running');
    setRunDaaStatusText('Refreshing Step2 market sources...');

    window.dispatchEvent(new CustomEvent(DAA_FUNDS_HUB_REFRESH_MARKET_EVENT));
    const refreshResult = await waitForRunDaaStepV0(DAA_FUNDS_HUB_REFRESH_MARKET_DONE_EVENT, 45_000);
    if (!refreshResult.ok) {
      setRunDaaStatus('error');
      setRunDaaStatusText(`Step2 refresh failed: ${refreshResult.error ?? 'unknown error'}`);
      return;
    }

    setRunDaaStatusText('Generating Step4 recommendation...');
    window.dispatchEvent(new CustomEvent(DAA_FUNDS_HUB_RUN_RECOMMENDATION_EVENT));
    const runResult = await waitForRunDaaStepV0(DAA_FUNDS_HUB_RUN_RECOMMENDATION_DONE_EVENT, 45_000);
    if (!runResult.ok) {
      setRunDaaStatus('error');
      setRunDaaStatusText(`Step4 recommendation failed: ${runResult.error ?? 'unknown error'}`);
      return;
    }

    setRunDaaStatus('ok');
    setRunDaaStatusText('Run DAA completed: Step2 refreshed and Step4 recommendation updated.');
    jumpTo('step4');
    window.setTimeout(() => {
      setRunDaaStatus('idle');
      setRunDaaStatusText('');
    }, 3000);
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

  // Cash bucket targets (keep cash vs invest): model it as an investable slice of equity,
  // then scale asset weights so sum(targetWeightsEffective) < 1 implies a cash target.
  const moneyPlanInvestablePct01 = useMemo(() => {
    const mp: any = moneyPlan as any;
    const total = toFiniteNumber(mp?.account?.totalEquity);
    const investable = toFiniteNumber(mp?.account?.investable);

    if (total !== null && total > 0 && investable !== null && investable >= 0) {
      const pct = investable / total;
      if (Number.isFinite(pct)) return Math.max(0, Math.min(1, pct));
    }

    return null;
  }, [moneyPlan]);

  const investablePct01 = useMemo(
    () => deriveInvestablePct01V0({ moneyPlanInvestablePct01, targetCashPct01: cashBucketTargetPct01 }),
    [cashBucketTargetPct01, moneyPlanInvestablePct01]
  );

  const targetWeightsEffective = useMemo(() => {
    const scaled = scaleTargetWeightsByInvestablePct01V0(targetWeights, investablePct01);

    if (!assetBlacklistSetV0.size) return scaled;
    return scaled.filter((t) => !assetBlacklistSetV0.has(normalizePlanSymbol((t as any)?.id)));
  }, [assetBlacklistSetV0, investablePct01, targetWeights]);

  const lastRunTargetWeightsPre = useMemo(() => {
    if (rebalanceReq && typeof rebalanceReq === 'object') {
      const r: any = rebalanceReq as any;
      const raw = r.targetWeights ?? r.target_weights;
      const tw = normalizeTargetWeightsAny(raw);
      if (tw.length) return tw;
    }
    return targetWeightsEffective;
  }, [rebalanceReq, targetWeightsEffective]);

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

  const [ordersPreviewSourceV0, setOrdersPreviewSourceV0] = useState<OrdersPreviewSourceV0>(() => {
    if (typeof window === 'undefined') return 'RECOMPUTE';
    const raw = window.localStorage.getItem(LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0);
    return raw === 'ENGINE_LAST_RUN' ? 'ENGINE_LAST_RUN' : 'RECOMPUTE';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0, String(ordersPreviewSourceV0));
  }, [ordersPreviewSourceV0]);

  useEffect(() => {
    if (ordersPreviewSourceV0 === 'ENGINE_LAST_RUN' && !engineOrders.length) {
      setOrdersPreviewSourceV0('RECOMPUTE');
    }
  }, [engineOrders.length, ordersPreviewSourceV0]);

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

  const holdingsForWeightsEffective = useMemo(() => {
    if (!assetBlacklistSetV0.size) return holdingsForWeights;
    const out: HoldingsLike = {};
    for (const [codeRaw, h] of Object.entries(holdingsForWeights ?? {})) {
      const code = normalizePlanSymbol(codeRaw);
      if (!code) continue;
      if (assetBlacklistSetV0.has(code)) continue;
      out[codeRaw] = h as any;
    }
    return out;
  }, [assetBlacklistSetV0, holdingsForWeights]);

  const currentWeights = useMemo(() => {
    if (!holdingsForWeightsEffective || !Object.keys(holdingsForWeightsEffective).length) return [] as Array<{ id: string; label: string; value: number }>;

    const byCode = new Map<string, FundLike>();
    for (const f of funds ?? []) {
      const code = String(f?.code ?? '').trim();
      if (code) byCode.set(code, f);
    }

    const rows: Array<{ id: string; label: string; value: number }> = [];
    for (const [codeRaw, h] of Object.entries(holdingsForWeightsEffective ?? {})) {
      const code = String(codeRaw ?? '').trim();
      if (!code) continue;

      const share = toFiniteNumber((h as any)?.share);
      if (!share || share <= 0) continue;

      const fund = byCode.get(code);
      const pick = resolveFundPriceV0({ symbol: code, snapshot: priceSnapshot, fund: fund ?? undefined });
      const nav = pick.price;

      const value = nav ? share * nav : 0;
      if (value <= 0) continue;

      rows.push({ id: code, label: String((fund as any)?.name ?? code), value });
    }

    rows.sort((a, b) => b.value - a.value);
    return rows;
  }, [funds, holdingsForWeightsEffective, priceSnapshot]);

  const priceDataWarningsV0 = useMemo(() => {
    const byCode = new Map<string, FundLike>();
    for (const f of funds ?? []) {
      const code = normalizePlanSymbol((f as any)?.code);
      if (code) byCode.set(code, f);
    }

    const labelBySym = new Map<string, string>();
    for (const t of targetWeightsEffective ?? []) {
      const id = normalizePlanSymbol((t as any)?.id);
      if (!id) continue;
      labelBySym.set(id, String((t as any)?.label ?? id));
    }

    const symbols = new Set<string>([
      ...Object.keys(holdingsForWeightsEffective ?? {}).map((x) => normalizePlanSymbol(x)),
      ...(targetWeightsEffective ?? []).map((t) => normalizePlanSymbol((t as any)?.id))]);

    const missing: Array<{ sym: string; label: string }> = [];
    const lastClose: Array<{ sym: string; label: string; price: number }> = [];

    const list = Array.from(symbols).filter(Boolean).sort();
    for (const sym of list) {
      const fund = byCode.get(sym);
      const pick = resolveFundPriceV0({ symbol: sym, snapshot: priceSnapshot, fund });
      const label = labelBySym.get(sym) ?? String((fund as any)?.name ?? sym);

      const px = pick.price;
      if (!px || px <= 0) {
        missing.push({ sym, label });
        continue;
      }

      if (pick.source === 'dwjz') {
        lastClose.push({ sym, label, price: px });
      }
    }

    return { missing, lastClose };
  }, [funds, holdingsForWeightsEffective, priceSnapshot, targetWeightsEffective]);

  const rebalanceTableRows = useMemo(() => {
    const total = currentWeights.reduce((acc, r) => acc + r.value, 0) + Math.max(0, toFiniteNumber(portfolioCash) ?? 0);
    if (!Number.isFinite(total) || total <= 0) return [] as Array<{ id: string; label: string; currentPct: number; targetPct: number; deltaPct: number }>;

    const currentById = new Map<string, { label: string; currentPct: number }>();
    for (const r of currentWeights) currentById.set(r.id, { label: r.label, currentPct: r.value / total });

    const targetById = new Map<string, { label: string; targetPct: number }>();
    for (const t of targetWeightsEffective) targetById.set(t.id, { label: t.label, targetPct: t.targetPct });

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
  }, [currentWeights, portfolioCash, targetWeightsEffective]);

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

  const driftOverviewV0 = useMemo(() => {
    if (!targetWeightsEffective.length) {
      return {
        kind: 'missing-targets' as const,
        title: 'Set target weights to compute allocation drift.'};
    }

    if (!rebalanceTableRows.length) {
      return {
        kind: 'empty' as const,
        title: 'No holdings/quotes available to compute allocation drift.'};
    }

    const alert = computeDriftAlertFromTableRows({ at: new Date().toISOString(), rows: rebalanceTableRows, thresholdPct: driftThresholdPct });

    const sym = alert.maxAbsDriftSymbol;
    const row = sym ? rebalanceTableRows.find((r) => r.id === sym) : null;
    const label = (row?.label ?? sym ?? '').trim();

    const maxAbsText = fmtPct01(alert.maxAbsDriftPct);
    const thresholdText = fmtPct01(alert.thresholdPct);

    const title = [
      `Allocation drift vs target (source=${targetWeightsSource})`,
      `maxAbs=${maxAbsText}${label ? ` (${label})` : ''}`,
      `threshold=${thresholdText}`,
      `breaches: over=${driftCounts.over}, under=${driftCounts.under}, within=${driftCounts.within}`].join('; ');

    return {
      kind: 'ok' as const,
      breached: alert.breached,
      maxAbsText,
      thresholdText,
      label,
      title};
  }, [
    driftCounts.over,
    driftCounts.under,
    driftCounts.within,
    driftThresholdPct,
    rebalanceTableRows,
    targetWeightsEffective.length,
    targetWeightsSource]);

  const filteredRebalanceTableRows = useMemo(() => {
    if (driftFilter === 'over') return rebalanceTableRows.filter((r) => r.deltaPct >= driftThresholdPct);
    if (driftFilter === 'under') return rebalanceTableRows.filter((r) => r.deltaPct <= -driftThresholdPct);
    return rebalanceTableRows;
  }, [driftFilter, rebalanceTableRows, driftThresholdPct]);

  const naiveOrders = useMemo(() => {
    if (!rebalanceTableRows.length) return [] as SuggestedOrder[];

    const total = currentWeights.reduce((acc, r) => acc + r.value, 0) + Math.max(0, toFiniteNumber(portfolioCash) ?? 0);
    if (!Number.isFinite(total) || total <= 0) return [];

    // v0: notional-based orders. Apply a simple lot-size rounding step so the preview diff
    // reflects real-world min-order/increment constraints.
    const lotStep = Math.max(0, toFiniteNumber((rebalancePolicy as any)?.minTradeNotional) ?? 0);
    const minNotional = Math.max(10, total * 0.002, lotStep); // >=0.2% or 10 base units (and >= lotStep)

    const out: SuggestedOrder[] = [];
    for (const r of rebalanceTableRows) {
      if (driftThresholdPct > 0 && Math.abs(r.deltaPct) < driftThresholdPct) continue;

      const deltaValue = (r.targetPct - r.currentPct) * total;
      const rawNotional = Math.abs(deltaValue);

      const notional = lotStep > 0 ? Math.floor(rawNotional / lotStep + 1e-12) * lotStep : rawNotional;
      if (!Number.isFinite(notional) || notional < minNotional) continue;

      const side = deltaValue > 0 ? 'BUY' : 'SELL';
      out.push({
        symbol: r.id,
        side,
        notional,
        reason: `delta=${((r.targetPct - r.currentPct) * 100).toFixed(1)}% (naive${lotStep > 0 ? `, lot=${lotStep}` : ''})`
      });
    }

    out.sort((a, b) => b.notional - a.notional);
    return out;
  }, [currentWeights, driftThresholdPct, portfolioCash, rebalancePolicy, rebalanceTableRows]);

  const naiveOrdersDiagnostics = useMemo(() => {
    if (!rebalanceTableRows.length) return null;

    const total = currentWeights.reduce((acc, r) => acc + r.value, 0) + Math.max(0, toFiniteNumber(portfolioCash) ?? 0);
    if (!Number.isFinite(total) || total <= 0) return null;

    const lotStep = Math.max(0, toFiniteNumber((rebalancePolicy as any)?.minTradeNotional) ?? 0);
    const minNotional = Math.max(10, total * 0.002, lotStep);

    let candidateCount = 0;
    let producedCount = 0;

    const suppressed: Array<{
      id: string;
      label: string;
      side: 'BUY' | 'SELL';
      driftPct: number;
      rawNotional: number;
      roundedNotional: number;
      reason: 'below-min-notional' | 'rounded-to-zero';
    }> = [];

    for (const r of rebalanceTableRows) {
      if (driftThresholdPct > 0 && Math.abs(r.deltaPct) < driftThresholdPct) continue;

      const deltaValue = (r.targetPct - r.currentPct) * total;
      const rawNotional = Math.abs(deltaValue);
      if (!(Number.isFinite(rawNotional) && rawNotional > 0)) continue;

      candidateCount += 1;

      const roundedNotional = lotStep > 0 ? Math.floor(rawNotional / lotStep + 1e-12) * lotStep : rawNotional;

      if (!(Number.isFinite(roundedNotional) && roundedNotional > 0)) {
        suppressed.push({
          id: r.id,
          label: r.label,
          side: deltaValue > 0 ? 'BUY' : 'SELL',
          driftPct: r.deltaPct,
          rawNotional,
          roundedNotional: Number.isFinite(roundedNotional) ? roundedNotional : 0,
          reason: 'rounded-to-zero'});
        continue;
      }

      if (roundedNotional < minNotional) {
        suppressed.push({
          id: r.id,
          label: r.label,
          side: deltaValue > 0 ? 'BUY' : 'SELL',
          driftPct: r.deltaPct,
          rawNotional,
          roundedNotional,
          reason: 'below-min-notional'});
        continue;
      }

      producedCount += 1;
    }

    suppressed.sort((a, b) => b.rawNotional - a.rawNotional);

    return {
      total,
      lotStep,
      minNotional,
      candidateCount,
      producedCount,
      suppressedCount: suppressed.length,
      suppressedTop: suppressed.slice(0, 3)};
  }, [currentWeights, driftThresholdPct, portfolioCash, rebalancePolicy, rebalanceTableRows]);

  const corePreview = useMemo((): { req: RebalanceCoreRequest; resp: RebalanceCoreResponse } | null => {
    // Keep the "recompute" preview path consistent with the actual core route:
    // cash buffer (scaled weights) + minTradeNotional lot rounding should match.
    try {
      const st = loadPortfolioStateV1();

      const mp: any = moneyPlan as any;
      const mpConstraints: any = mp?.constraints ?? {};

      const constraints: any = { minNotional: 0.01 };
      const maxPositionPct = toFiniteNumber(mpConstraints?.maxPositionPct);
      const maxIn = toFiniteNumber(mpConstraints?.maxIn);
      const maxOut = toFiniteNumber(mpConstraints?.maxOut);
      if (maxPositionPct !== null) constraints.maxPositionPct = maxPositionPct;
      if (maxIn !== null) constraints.maxIn = maxIn;
      if (maxOut !== null) constraints.maxOut = maxOut;
      if (assetBlacklistV0.length) constraints.assetBlacklist = assetBlacklistV0;

      const holdingsMap: Record<string, number> = {};
      for (const [symRaw, p] of Object.entries(st.positions ?? {})) {
        const sym = String(symRaw ?? '').trim();
        if (!sym) continue;
        if (assetBlacklistSetV0.has(normalizePlanSymbol(sym))) continue;

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
      const symbols = new Set<string>([...Object.keys(holdingsMap), ...targetWeightsEffective.map((t) => t.id)]);
      for (const sym of symbols) {
        const pick = resolveFundPriceV0({ symbol: sym, snapshot: priceSnapshot, fund: byCode.get(sym) });
        const nav = pick.price;
        if (nav && nav > 0) pricesMap[sym] = nav;
      }

      const basePolicy = loadRebalancePolicyV1();
      const policy = {
        ...basePolicy,
        // What-if: allow users to override drift threshold without persisting it to the policy store.
        thresholdPct: driftThresholdPct,
        lastRebalanceAt: st.lastRebalance?.at};

      const account: any = { cash: st.cash };
      if (baseCcy) account.baseCcy = baseCcy;

      const req: RebalanceCoreRequest = {
        account,
        constraints,
        policy,
        holdings: holdingsMap,
        prices: pricesMap,
        targetWeights: targetWeightsEffective};

      return { req, resp: rebalanceCore(req) };
    } catch {
      return null;
    }
  }, [baseCcy, driftThresholdPct, funds, moneyPlan, priceSnapshot, rev, targetWeightsEffective]);

  const recomputeOrders = useMemo(() => {
    if (corePreview?.resp) return normalizeOrders(corePreview.resp.orders);
    return naiveOrders;
  }, [corePreview, naiveOrders]);

  const effectiveOrders = useMemo(() => {
    if (ordersPreviewSourceV0 === 'ENGINE_LAST_RUN') return engineOrders;
    return recomputeOrders;
  }, [engineOrders, ordersPreviewSourceV0, recomputeOrders]);

  const effectiveEngineWarnings = useMemo(() => {
    const resp: any = ordersPreviewSourceV0 === 'ENGINE_LAST_RUN' ? (rebalanceResp as any) : (corePreview?.resp as any);
    const raw = resp?.warnings;
    return Array.isArray(raw) ? raw.map((x: any) => String(x)) : [];
  }, [corePreview, ordersPreviewSourceV0, rebalanceResp]);

  const effectiveEngineNotes = useMemo(() => {
    const resp: any = ordersPreviewSourceV0 === 'ENGINE_LAST_RUN' ? (rebalanceResp as any) : (corePreview?.resp as any);
    const raw = resp?.explain?.notes;
    return Array.isArray(raw) ? raw.map((x: any) => String(x)) : [];
  }, [corePreview, ordersPreviewSourceV0, rebalanceResp]);

  const tradeRationaleRowsV0 = useMemo(() => {
    if (!effectiveOrders.length) return [] as Array<{
      key: string;
      symbol: string;
      label: string;
      side: 'BUY' | 'SELL';
      notional: number;
      notionalPct: number | null;
      currentPct: number | null;
      targetPct: number | null;
      driftPct: number | null;
      reason: string;
    }>;

    const total = currentWeights.reduce((acc, r) => acc + (Number.isFinite(r.value) ? r.value : 0), 0) + Math.max(0, toFiniteNumber(portfolioCash) ?? 0);
    const byId = new Map(rebalanceTableRows.map((r) => [String(r.id), r] as const));

    return effectiveOrders.map((o, idx) => {
      const symbol = String((o as any)?.symbol ?? '').trim();
      const side = ((o as any)?.side === 'BUY' || (o as any)?.side === 'SELL' ? (o as any).side : 'BUY') as 'BUY' | 'SELL';
      const notional = toFiniteNumber((o as any)?.notional) ?? 0;

      const row = symbol ? byId.get(symbol) : undefined;
      const label = row?.label ?? symbol;

      const driftPct = row ? row.deltaPct : null;
      const currentPct = row ? row.currentPct : null;
      const targetPct = row ? row.targetPct : null;
      const notionalPct = total > 0 && Number.isFinite(notional) ? notional / total : null;

      const fallback =
        driftPct === null
          ? ''
          : side === 'BUY'
            ? `underweight ${(Math.abs(driftPct) * 100).toFixed(1)}% vs target`
            : `overweight ${(Math.abs(driftPct) * 100).toFixed(1)}% vs target`;

      const reason = String((o as any)?.reason ?? '').trim() || fallback;

      return {
        key: `${symbol || 'UNKNOWN'}-${idx}`,
        symbol,
        label,
        side,
        notional,
        notionalPct,
        currentPct,
        targetPct,
        driftPct,
        reason};
    });
  }, [currentWeights, effectiveOrders, portfolioCash, rebalanceTableRows]);

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

  const previewTargetWeightsPre = useMemo(() => {
    if (ordersPreviewSourceV0 === 'ENGINE_LAST_RUN') return lastRunTargetWeightsPre;
    return targetWeightsEffective;
  }, [lastRunTargetWeightsPre, ordersPreviewSourceV0, targetWeightsEffective]);

  const previewTargetWeightsPost = useMemo(() => {
    if (ordersPreviewSourceV0 === 'ENGINE_LAST_RUN') return lastRunTargetWeightsPost;

    // Core normalizes weights (caps, implicit cash, etc). Use the core output if we have it.
    if (corePreview?.resp) {
      const tw = normalizeTargetWeightsAny((corePreview.resp as any).targetWeights);
      return tw.length ? tw : previewTargetWeightsPre;
    }

    return previewTargetWeightsPre;
  }, [corePreview, lastRunTargetWeightsPost, ordersPreviewSourceV0, previewTargetWeightsPre]);

  const whatIfTargetWeightsPreBySymbol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of previewTargetWeightsPre) out[t.id] = t.targetPct;
    return out;
  }, [previewTargetWeightsPre]);

  const whatIfTargetWeightsPostBySymbol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of previewTargetWeightsPost) out[t.id] = t.targetPct;
    return out;
  }, [previewTargetWeightsPost]);

  const whatIfLabelsBySymbol = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of currentWeights) out[r.id] = r.label;
    for (const t of previewTargetWeightsPre) out[t.id] = t.label;
    for (const t of previewTargetWeightsPost) out[t.id] = t.label;
    return out;
  }, [currentWeights, previewTargetWeightsPost, previewTargetWeightsPre]);

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
      labelsBySymbol: whatIfLabelsBySymbol});
  }, [effectiveOrders, portfolioCash, whatIfFeeBps, whatIfLabelsBySymbol, whatIfSlippageBpsUsed, whatIfTargetWeightsPostBySymbol, whatIfValuesBySymbol]);

  const preTradeCashCheck = useMemo(() => {
    return getPreTradeCashCheckV0({
      sellProceedsRoutingV0,
      cashStart: portfolioCash,
      orders: effectiveOrders,
      feeBps: whatIfFeeBps,
      slippageBps: whatIfSlippageBpsUsed,
      baseCcy});
  }, [baseCcy, effectiveOrders, portfolioCash, sellProceedsRoutingV0, whatIfFeeBps, whatIfSlippageBpsUsed]);

  const preRunViolationsV0 = useMemo(() => {
    const respAny: any = ordersPreviewSourceV0 === 'ENGINE_LAST_RUN' ? (rebalanceResp as any) : (corePreview?.resp as any);

    const diag =
      ordersPreviewSourceV0 === 'RECOMPUTE' && !corePreview?.resp && naiveOrdersDiagnostics
        ? {
            candidateCount: naiveOrdersDiagnostics.candidateCount,
            producedCount: naiveOrdersDiagnostics.producedCount,
            minNotional: naiveOrdersDiagnostics.minNotional,
            lotStep: naiveOrdersDiagnostics.lotStep,
            suppressedTop: (naiveOrdersDiagnostics.suppressedTop ?? []).map((x) => ({
              id: x.id,
              side: x.side,
              rawNotional: x.rawNotional,
              roundedNotional: x.roundedNotional}))}
        : null;

    return buildRebalanceViolationsV0({
      baseCcy,
      preTradeCashCheck,
      coreResp: respAny ?? null,
      whatIf,
      maxTurnoverPct01: maxTurnoverPct01V0,
      naiveMinTradeDiag: diag});
  }, [baseCcy, corePreview, maxTurnoverPct01V0, naiveOrdersDiagnostics, ordersPreviewSourceV0, preTradeCashCheck, rebalanceResp, whatIf]);

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
      driftPct: cashPostPct - targetCashPostPct};

    const rows = whatIf.rows.map((r) => ({ ...r, targetPrePct: whatIfTargetWeightsPreBySymbol[r.id] ?? 0 }));
    return [cashRow, ...rows];
  }, [whatIf, whatIfTargetWeightsPreBySymbol, whatIfTargetWeightsPostBySymbol]);

  const whatIfAllocationDiffRowsV0 = useMemo(() => {
    return whatIfRows
      .filter((r) => r && typeof r.id === 'string')
      .map((r) => ({
        id: String(r.id),
        label: String((r as any).label ?? r.id),
        beforePct01: Number.isFinite((r as any).currentPct) ? (r as any).currentPct : 0,
        afterPct01: Number.isFinite((r as any).postPct) ? (r as any).postPct : 0,
        targetPct01: Number.isFinite((r as any).targetPct) ? (r as any).targetPct : 0}));
  }, [whatIfRows]);

  const taxLotsImpactV0 = useMemo(() => {
    if (!whatIf) return null;

    const sellOrders = (effectiveOrders ?? [])
      .filter((o) => o && o.side === 'SELL' && o.symbol && Number.isFinite(o.notional) && o.notional > 0)
      .map((o) => ({ symbol: String(o.symbol), side: 'SELL' as const, notional: o.notional }));

    if (!sellOrders.length) return null;

    // Prices: use the same resolver as the preview tables (snapshot preferred, fallback to fund dwjz price).
    const byCode = new Map<string, FundLike>();
    for (const f of funds ?? []) {
      const code = String((f as any)?.code ?? '').trim();
      if (code) byCode.set(code, f);
    }

    const pricesBySymbol: Record<string, number> = {};
    for (const o of sellOrders) {
      const sym = String(o.symbol ?? '').trim();
      if (!sym) continue;
      const fund = byCode.get(sym);
      const pick = resolveFundPriceV0({ symbol: sym, snapshot: priceSnapshot, fund: fund ?? undefined });
      if (pick.price && pick.price > 0) pricesBySymbol[sym] = pick.price;
    }

    let positionsBySymbol: any = {};
    try {
      positionsBySymbol = loadPortfolioStateV1().positions ?? {};
    } catch {
      positionsBySymbol = {};
    }

    const costBps = (toFiniteNumber(whatIfFeeBps) ?? 0) + (toFiniteNumber(whatIfSlippageBpsUsed) ?? 0);

    return estimateTaxLotsImpactV0({
      orders: sellOrders,
      pricesBySymbol,
      positionsBySymbol,
      costBps});
  }, [effectiveOrders, estimateTaxLotsImpactV0, funds, priceSnapshot, whatIf, whatIfFeeBps, whatIfSlippageBpsUsed]);

  async function doCopyOrders() {
    try {
      const payload = {
        source:
          ordersPreviewSourceV0 === 'ENGINE_LAST_RUN'
            ? 'core:last-run'
            : corePreview?.resp
              ? 'core:recompute'
              : 'naive:recompute',
        at: new Date().toISOString(),
        orders: effectiveOrders};
      const text = [
        '# Suggested Orders (v0)',
        '',
        formatOrdersMarkdown(effectiveOrders),
        '',
        '```json',
        JSON.stringify(payload, null, 2),
        '```'].join('\n');

      await copyTextToClipboard(text);
      setCopyOrdersStatus('ok');
      window.setTimeout(() => setCopyOrdersStatus('idle'), 1200);
    } catch {
      setCopyOrdersStatus('error');
      window.setTimeout(() => setCopyOrdersStatus('idle'), 2000);
    }
  }

  async function doCopyApprovalSummaryV0() {
    try {
      const scheduleEnabled = loadRebalanceScheduleStateV1().schedule.enabled;
      const action = safetyStopPendingOpts?.cashSweep ? 'cash-sweep' : 'dynamic-rebalance';

      const md = buildRebalanceApprovalSummaryMarkdownV0({
        atIso: new Date().toISOString(),
        action,
        baseCcy,
        scheduleEnabled,
        executionMode: executionMode === 'live' ? 'live' : 'dry-run',
        feeBps: whatIfFeeBps,
        slippageBpsBase: whatIfSlippageBps,
        slippageSensitivity: whatIfSlippageSensitivityV0,
        slippageBpsEffective: whatIfSlippageBpsUsed,
        sellProceedsRouting: sellProceedsRoutingV0,
        overrideBlockers: preflightOverrideBlockers,
        orders: (safetyStopPreviewOrders ?? [])
          .filter((o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0)
          .map((o) => ({ symbol: String(o.symbol), side: o.side as 'BUY' | 'SELL', notional: o.notional, reason: (o as any).reason })),
        whatIf: safetyStopPreviewWhatIf,
        violations: preRunViolationsV0});

      await copyTextToClipboard(md);
      setCopyApprovalSummaryStatus('ok');
      window.setTimeout(() => setCopyApprovalSummaryStatus('idle'), 1200);
    } catch {
      setCopyApprovalSummaryStatus('error');
      window.setTimeout(() => setCopyApprovalSummaryStatus('idle'), 2000);
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
        '```'].join('\n');
      await copyTextToClipboard(text);
      setCopyWeightsStatus('ok');
      window.setTimeout(() => setCopyWeightsStatus('idle'), 1200);
    } catch {
      setCopyWeightsStatus('error');
      window.setTimeout(() => setCopyWeightsStatus('idle'), 2000);
    }
  }

  function doExportPlanCsvV0() {
    const source =
      ordersPreviewSourceV0 === 'ENGINE_LAST_RUN'
        ? 'core:last-run'
        : corePreview?.resp
          ? 'core:recompute'
          : 'naive:recompute';

    const atIso = new Date().toISOString();
    const csv = buildRebalancePlanCsvV0({
      atIso,
      source,
      baseCcy,
      allocations: rebalanceTableRows,
      orders: effectiveOrders});

    const ts = atIso.slice(0, 19).replace(/[:T]/g, '-');
    downloadTextAsFile({
      filename: `daa-rebalance-plan-${ts}.csv`,
      text: csv,
      mime: 'text/csv;charset=utf-8'});
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
    input: unknown): { ok: true; seriesBySymbol: Record<string, any[]>; symbols: string[] } | { ok: false; error: string } {
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

  // buildAutoPlanMarkdownV0 lives in src/core/autoPlanMarkdownV0 so it can be unit-tested.

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
        if (assetBlacklistSetV0.has(sym)) continue;

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
      const symbols = new Set<string>([
        ...Object.keys(holdingsMap),
        ...targetWeightsEffective.map((t) => normalizePlanSymbol((t as any)?.id))]);

      for (const sym of symbols) {
        const pick = resolveFundPriceV0({ symbol: sym, snapshot: priceSnapshot, fund: byCode.get(sym) });
        const nav = pick.price;
        if (nav && nav > 0) pricesMap[sym] = nav;
      }

      const syms = Object.keys(pricesMap).sort();
      if (!syms.length) {
        setAutoPlanErrorForActive("No prices found to seed snapshots. Please fill in the Price Snapshot first.");
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

      setAutoPlanErrorForActive(null);
      setAutoPlanInputTextForActive(pretty({ snapshots: [snap0, snap1, snap2] }));
    } catch (e) {
      setAutoPlanErrorForActive(e instanceof Error ? e.message : String(e));
    }
  }

  function runAutoPlanV0() {
    setAutoPlanErrorForActive(null);

    if (typeof window === "undefined") return;

    if (!targetWeights.length) {
      setAutoPlanErrorForActive("Missing targetWeights. Please configure target weights first.");
      return;
    }

    const raw = String(autoPlanInputText ?? "").trim();
    if (!raw) {
      setAutoPlanErrorForActive("Provide drift input (seriesBySymbol or snapshots). Tip: click Seed from current snapshot.");
      return;
    }

    const parsed = safeJsonParse(raw);
    if (!parsed.ok) {
      setAutoPlanErrorForActive(parsed.error);
      return;
    }

    const seriesRes = tryBuildSeriesBySymbolForPlan(parsed.value);
    if (!seriesRes.ok) {
      setAutoPlanErrorForActive(seriesRes.error);
      return;
    }

    const st = loadPortfolioStateV1();

    const holdingsMap: Record<string, number> = {};
    for (const [symRaw, p] of Object.entries(st.positions ?? {})) {
      const sym = normalizePlanSymbol(symRaw);
      if (!sym) continue;
      if (assetBlacklistSetV0.has(sym)) continue;

      const qty = toFiniteNumber((p as any)?.qty);
      if (!qty || qty <= 0) continue;

      holdingsMap[sym] = qty;
    }

    const targetWeightsMap: Record<string, number> = {};
    for (const t of targetWeightsEffective) {
      const id = normalizePlanSymbol((t as any)?.id);
      const w = toFiniteNumber((t as any)?.targetPct);
      if (!id) continue;
      if (w === null || w < 0) continue;
      targetWeightsMap[id] = w;
    }

    const required = new Set<string>([...Object.keys(holdingsMap), ...Object.keys(targetWeightsMap)]);
    const missing = Array.from(required).filter((sym) => !(sym in seriesRes.seriesBySymbol));

    if (missing.length) {
      setAutoPlanErrorForActive(
        `Missing symbols in series: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " ..." : ""}`);
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
    if (assetBlacklistV0.length) constraints.assetBlacklist = assetBlacklistV0;

    const cash0 = toFiniteNumber((st as any)?.cash) ?? 0;

    try {
      const res = backtestDriftRebalance({
        seriesBySymbol: seriesRes.seriesBySymbol as any,
        targetWeights: targetWeightsMap,
        initialHoldings: holdingsMap,
        initialCash: cash0,
        constraints,
        policy: { ...rebalancePolicy, thresholdPct: autoPlanThresholdPctUsed },
        bootstrapToTarget: false,
        includeEventStates: true});

      setAutoPlanResultForActive(res);
      if (autoPlanScenario === 'A') {
        saveJsonToLs(LS_AUTO_PLAN_RESULT_A, res);
        saveJsonToLs(LS_AUTO_PLAN_RESULT, res); // legacy
      } else {
        saveJsonToLs(LS_AUTO_PLAN_RESULT_B, res);
      }
    } catch (e) {
      setAutoPlanErrorForActive(e instanceof Error ? e.message : String(e));
    }
  }


  function openPreflightForRun(opts?: { cashSweep?: boolean }) {
    const hasPriceWarnings = priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0;
    const hasConstraintAlerts = preRunHasBlockingV0 || preRunHasWarningsV0;

    setPreflightPendingOpts(opts ?? {});

    // Reduce friction when there is nothing actionable to review.
    setPreflightAckPrices(!hasPriceWarnings);
    setPreflightAckConstraints(!hasConstraintAlerts);

    // Force an explicit acknowledgment for settlement/cash assumptions.
    setPreflightAckCash(false);

    setPreflightOverrideBlockers(false);
    setPreflightOpen(true);
  }

  function closePreflight() {
    setPreflightOpen(false);
    setPreflightPendingOpts(null);
  }

  function closePreflightAndJump(id: string) {
    setPreflightOpen(false);
    setTimeout(() => scrollToId(id), 0);
  }

  function closeSafetyStop() {
    setSafetyStopOpen(false);
    setSafetyStopPendingOpts(null);
  }

  function safetyStopDisableDynamicScheduleV0() {
    // "Kill switch" for accidental one-click runs: disable the local dynamic schedule.
    try {
      const st = loadRebalanceScheduleStateV1();
      if (st.schedule.enabled) persistRebalanceScheduleV1({ ...st.schedule, enabled: false });
    } catch {
      // ignore
    }

    closeSafetyStop();
  }

  async function proceedFromPreflight() {
    const pending = preflightPendingOpts;
    closePreflight();

    if (!pending) return;

    setSafetyStopPendingOpts(pending);
    setSafetyStopOpen(true);
  }

  async function proceedFromSafetyStop() {
    const pending = safetyStopPendingOpts;
    closeSafetyStop();

    // Used for the "Retry" UX when a run fails mid-flight.
    setPaperRunLastConfirmedOpts(pending ?? {});

    if (pending && pending.cashSweep) return runPaperRebalanceCore({ cashSweep: true });
    return runPaperRebalanceCore();
  }

  async function runPaperRebalanceCore(opts?: { cashSweep?: boolean }) {
    setPaperRunError(null);
    setPaperRunRecordedAt(null);
    setPaperRunSummary(null);
    setPaperRunPostSummary(null);
    setPaperRunHealthcheck(null);
    setPaperRunDriftAlert(null);
    setPaperRunFailureDetails(null);

    if (typeof window === 'undefined') return;

    let statusRunId: string | null = null;

    function makeAbortError(): any {
      try {
        return new DOMException('Aborted', 'AbortError');
      } catch {
        const e: any = new Error('aborted');
        e.name = 'AbortError';
        return e;
      }
    }

    function abortableSleep(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(makeAbortError());
          return;
        }

        let onAbort: (() => void) | null = null;

        const id = window.setTimeout(() => {
          if (onAbort) signal?.removeEventListener('abort', onAbort);
          resolve();
        }, ms);

        onAbort = () => {
          window.clearTimeout(id);
          reject(makeAbortError());
        };

        if (signal) signal.addEventListener('abort', onAbort, { once: true });
      });
    }

    async function simulatePaperBrokerFillProgressV0(args: {
      storage: Storage;
      runId: string;
      orders: Array<{ notional: number }>;
      signal: AbortSignal | null | undefined;
    }) {
      const steps = 4;
      const totalTargetMs = 2500;
      const perStepMs = Math.max(60, Math.min(250, Math.floor(totalTargetMs / Math.max(1, args.orders.length * steps))));

      for (let i = 0; i < args.orders.length; i++) {
        const orderId = String(i + 1);
        const notional = Number(args.orders[i]?.notional ?? NaN);

        for (let s = 1; s <= steps; s++) {
          await abortableSleep(perStepMs, args.signal);
          const pct = s / steps;
          const filledNotional = Number.isFinite(notional) ? notional * pct : undefined;

          updateRebalanceOrderStatusV0({
            storage: args.storage,
            runId: args.runId,
            orderId,
            status: s === steps ? 'filled' : 'submitted',
            filledNotional,
            fillPct01: pct,
            detail: s === steps ? 'filled' : `partial fill: ${Math.round(pct * 100)}%`,
            phase: 'executing'});
        }
      }
    }

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

    // v0: best-effort local snapshot so the UI can show per-order status while a run is in flight.
    const startedStatus = startRebalanceOrderStatusRunV0({
      storage: window.localStorage,
      message: opts?.cashSweep ? `Funds hub cash sweep (${mode})` : `Funds hub rebalance (${mode})`});
    if (startedStatus.ok) statusRunId = startedStatus.run.runId;

    setPaperRunLoading(true);

    paperRunAbortRef.current?.abort();
    const controller = new AbortController();
    paperRunAbortRef.current = controller;

    // Pre-compute drift breaches so the UI shows an immediate "live" alert even if the core route is slow.
    setPaperRunDriftAlert(
      computeDriftAlertFromTableRows({ at: new Date().toISOString(), rows: rebalanceTableRows, thresholdPct: opts?.cashSweep ? 0 : driftThresholdPct })
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
      if (assetBlacklistV0.length) constraints.assetBlacklist = assetBlacklistV0;

      const holdingsMap: Record<string, number> = {};
      for (const [symRaw, p] of Object.entries(st.positions ?? {})) {
        const sym = String(symRaw ?? '').trim();
        if (!sym) continue;
        if (assetBlacklistSetV0.has(normalizePlanSymbol(sym))) continue;

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
      const symbols = new Set<string>([...Object.keys(holdingsMap), ...targetWeightsEffective.map((t) => t.id)]);

      for (const sym of symbols) {
        const pick = resolveFundPriceV0({ symbol: sym, snapshot: priceSnapshot, fund: byCode.get(sym) });
        const nav = pick.price;
        if (nav && nav > 0) pricesMap[sym] = nav;
      }

      const valuesBySymbol: Record<string, number> = {};
      for (const [sym, qty] of Object.entries(holdingsMap)) {
        const px = toFiniteNumber((pricesMap as any)[sym]);
        if (px === null || px <= 0) continue;
        valuesBySymbol[sym] = qty * px;
      }

      const thresholdPctForRun = opts?.cashSweep ? 0 : driftThresholdPct;

      const basePolicy = loadRebalancePolicyV1();
      const policy = {
        ...basePolicy,
        // What-if: allow users to override drift threshold without persisting it to the policy store.
        thresholdPct: thresholdPctForRun,
        lastRebalanceAt: st.lastRebalance?.at,
        now: new Date().toISOString(),
        ...(opts?.cashSweep ? { cashSweepToTarget: true } : {})};

      const account: any = { cash: st.cash };
      if (baseCcy) account.baseCcy = baseCcy;

      const req = {
        account,
        constraints,
        policy,
        holdings: holdingsMap,
        prices: pricesMap,
        targetWeights: targetWeightsEffective};

      const expectedOrdersForRun = opts?.cashSweep
        ? (() => {
            try {
              return normalizeOrders(rebalanceCore(req).orders);
            } catch {
              return effectiveOrders;
            }
          })()
        : effectiveOrders;

      // "Expected" is used for the post-run healthcheck; it should match the request we're about to execute.
      const expectedSummary: RebalancePostRunSummaryV0 | null = (() => {
        try {
          return buildRebalancePostRunSummaryV0({
            cashStart: toFiniteNumber((st as any)?.cash) ?? 0,
            valuesBySymbol,
            targetWeightsBySymbol: whatIfTargetWeightsPostBySymbol,
            orders: expectedOrdersForRun,
            feeBps: whatIfFeeBps,
            slippageBps: whatIfSlippageBpsUsed,
            labelsBySymbol: whatIfLabelsBySymbol,
            pricesBySymbol: pricesMap});
        } catch {
          return null;
        }
      })();

      saveJsonToLs(LS_REBALANCE_REQUEST, req);

      // Core is deterministic and runs in-process (Next.js route), so this stays fast.
      const res = await fetch('/api/daa/rebalance/core', {
        method: 'POST',
        headers: { 'content-type': 'application/json'},
        body: JSON.stringify(req),
        signal: controller.signal});

      const text = await res.text();
      const parsed = safeJsonParse(text);
      const respValue = parsed.ok ? parsed.value : { raw: text };

      saveJsonToLs(LS_REBALANCE_RESPONSE, respValue);

      if (!res.ok) {
        // Core errors are usually { error, expected? }. Surface them instead of a bare HTTP status.
        const v: any = parsed.ok ? (respValue as any) : null;
        const serverErr = v && typeof v === 'object' ? (typeof v.error === 'string' ? String(v.error) : null) : null;
        const expected = v && typeof v === 'object' ? (typeof v.expected === 'string' ? String(v.expected) : null) : null;

        const msgBase = serverErr ? `Core error: ${serverErr}` : 'Core request failed';
        const msg = `${msgBase} (HTTP ${res.status})${expected ? `; expected: ${expected}` : ''}`;

        setPaperRunError(msg);
        setPaperRunFailureDetails((parsed.ok ? pretty(v) : text).slice(0, 8000));

        if (statusRunId) {
          failRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            error: msg,
            message: 'core request failed'});
        }

        return;
      }

      if (!parsed.ok) {
        const snippet = text ? text.slice(0, 240) : '';
        const msg = `Core response JSON parse failed (HTTP ${res.status})${snippet ? `; body: ${snippet}` : ''}`;

        setPaperRunError(msg);
        setPaperRunFailureDetails(text.slice(0, 8000));

        if (statusRunId) {
          failRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            error: msg,
            message: 'core response parse failed'});
        }

        return;
      }

      const resp: any = respValue as any;

      // Surface core-level drift/trigger info as a compact alert for fast feedback during runs.
      setPaperRunDriftAlert(computeDriftAlertFromCoreResponse({ at: new Date().toISOString(), resp, fallbackThresholdPct: thresholdPctForRun }));

      const shouldRebalance = !!resp?.trigger?.shouldRebalance;

      // Only execute/record a paper run when the trigger policy says "rebalance".
      // When shouldRebalance=false, still surface expected allocations (orders=0) so the user
      // can see a deterministic "no-op" outcome.
      const orders = shouldRebalance ? normalizeOrders(resp?.orders) : [];

      const runNote = opts?.cashSweep ? 'ui:market/funds:cash-sweep' : 'ui:market/funds:dry-run';

      if (!shouldRebalance) {
        setPaperRunSummary('触发策略: shouldRebalance=false（no-op；orders=0，展示预期 allocations）。');
        setPaperRunRecordedAt(new Date().toISOString());

        if (statusRunId) {
          finishRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            phase: 'done',
            message: 'shouldRebalance=false (no-op)'});
        }

        // Keep a traceable snapshot even for no-op runs (so the run history can show allocations).
        try {
          appendRebalanceLog({
            storage: window.localStorage,
            source: 'core',
            runId: statusRunId ?? undefined,
            request: req,
            response: respValue,
            note: runNote});
          window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
        } catch {
          // ignore
        }
      }

      if (shouldRebalance) {
        const coreCashCheck = getPreTradeCashCheckV0({
          sellProceedsRoutingV0,
          cashStart: st.cash,
          orders,
          feeBps: whatIfFeeBps,
          slippageBps: whatIfSlippageBpsUsed,
          baseCcy: baseCcy || null});

      if (coreCashCheck.blocking) {
        setPaperRunError(coreCashCheck.message);

        if (statusRunId) {
          failRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            error: coreCashCheck.message,
            message: 'pre-trade cash check blocked'});
        }

        return;
      }

      if (statusRunId) {
        attachOrdersToRebalanceRunV0({
          storage: window.localStorage,
          runId: statusRunId,
          orders,
          message: `executing ${orders.length} orders (paper)`});

        // v0: simulate broker-side partial fills so the UI can live-refresh progress during the run (E2E-friendly; no real broker).
        for (let i = 0; i < orders.length; i++) {
          const orderId = String(i + 1);
          updateRebalanceOrderStatusV0({
            storage: window.localStorage,
            runId: statusRunId,
            orderId,
            status: 'submitted',
            filledNotional: 0,
            fillPct01: 0,
            detail: 'submitted (paper broker)',
            phase: 'executing'});
        }
      }

      const exec = getExecutionAdapterV0('paper');
      const r = exec.executeOrders({
        storage: window.localStorage,
        source: 'rebalance-core',
        runId: statusRunId ?? undefined,
        orders,
        note: runNote});

      if (!r.ok) {
        setPaperRunError(r.error);

        if (statusRunId) {
          failRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            error: r.error,
            message: 'paper execution log failed'});
        }

        return;
      }

      if (statusRunId) {
        await simulatePaperBrokerFillProgressV0({
          storage: window.localStorage,
          runId: statusRunId,
          orders: orders as any,
          signal: controller.signal});

        finishRebalanceOrderStatusRunV0({
          storage: window.localStorage,
          runId: statusRunId,
          phase: 'recorded',
          message: `recorded ${orders.length} paper orders (simulated broker fills)`});
      }

      setPaperRunRecordedAt(r.entry.at);
      setPaperRunSummary(`已记录 Dry run（不发送真实订单）：${orders.length} 条 orders。`);

      try {
        pushDynamicRebalanceNotificationV0({
          storage: window.localStorage,
          atIso: r.entry.at,
          kind: 'run-recorded',
          title: 'Dynamic rebalance recorded',
          body: `Recorded ${orders.length} paper orders (${opts?.cashSweep ? 'cash sweep' : 'dry run'}).`});
      } catch {
        // ignore
      }
      }

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
            for (const t of targetWeightsEffective) {
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
            pricesBySymbol: pricesMap});
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
      // Keep behavior consistent with the historical path: only record when we actually have orders to execute.
      if (shouldRebalance && orders.length) {
        recordPortfolioLastRebalance({ kind: 'core', runId: statusRunId ?? undefined, request: req, response: respValue, logNote: runNote });
      }
    } catch (e) {
      const isAbort =
        typeof e === 'object' &&
        e !== null &&
        'name' in e &&
        (e as any).name === 'AbortError';

      if (isAbort) {
        setPaperRunSummary('已取消（abort）。');

        if (statusRunId) {
          failRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            error: 'aborted',
            message: 'user aborted run'});
        }
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setPaperRunError(msg);

        if (statusRunId) {
          failRebalanceOrderStatusRunV0({
            storage: window.localStorage,
            runId: statusRunId,
            error: msg,
            message: 'run failed'});
        }
      }
    } finally {
      paperRunAbortRef.current = null;
      setPaperRunLoading(false);
    }
  }

  const preRunHasBlockingV0 = preRunViolationsV0.some((v) => v.level === 'blocker');
  const preRunHasWarningsV0 = preRunViolationsV0.some((v) => v.level === 'warning');

  const preflightHasPriceWarnings = priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0;
  const preflightCanProceed =
    preflightAckPrices &&
    preflightAckConstraints &&
    preflightAckCash &&
    (!preRunHasBlockingV0 || preflightOverrideBlockers);

  const preflightPreviewOrders = useMemo(() => {
    // Preflight should preview the *actual* orders we're about to execute.
    // For cashSweep we recompute with thresholdPct=0 + cashSweepToTarget enabled.
    if (!preflightPendingOpts?.cashSweep) return effectiveOrders;

    try {
      if (!corePreview?.req) return effectiveOrders;

      const reqSweep: RebalanceCoreRequest = {
        ...corePreview.req,
        policy: {
          ...((corePreview.req as any).policy ?? {}),
          thresholdPct: 0,
          cashSweepToTarget: true}};

      return normalizeOrders(rebalanceCore(reqSweep).orders);
    } catch {
      return effectiveOrders;
    }
  }, [corePreview?.req, effectiveOrders, preflightPendingOpts?.cashSweep]);

  const preflightPreviewWhatIf = useMemo(() => {
    if (!preflightPreviewOrders.length) return null;

    return simulateRebalanceWhatIfV0({
      cashStart: toFiniteNumber(portfolioCash) ?? 0,
      valuesBySymbol: whatIfValuesBySymbol,
      targetWeightsBySymbol: whatIfTargetWeightsPostBySymbol,
      orders: preflightPreviewOrders
        .filter((o) => o && o.symbol && (o.side === "BUY" || o.side === "SELL") && Number.isFinite(o.notional) && o.notional > 0)
        .map((o) => ({ symbol: o.symbol, side: o.side as "BUY" | "SELL", notional: o.notional })),
      feeBps: whatIfFeeBps,
      slippageBps: whatIfSlippageBpsUsed,
      labelsBySymbol: whatIfLabelsBySymbol});
  }, [
    portfolioCash,
    preflightPreviewOrders,
    whatIfFeeBps,
    whatIfLabelsBySymbol,
    whatIfSlippageBpsUsed,
    whatIfTargetWeightsPostBySymbol,
    whatIfValuesBySymbol]);

  const safetyStopPreviewOrders = useMemo(() => {
    // Safety-stop should preview the *actual* orders we're about to execute.
    // For cashSweep we recompute with thresholdPct=0 + cashSweepToTarget enabled.
    if (!safetyStopPendingOpts?.cashSweep) return effectiveOrders;

    try {
      if (!corePreview?.req) return effectiveOrders;

      const reqSweep: RebalanceCoreRequest = {
        ...corePreview.req,
        policy: {
          ...((corePreview.req as any).policy ?? {}),
          thresholdPct: 0,
          cashSweepToTarget: true}};

      return normalizeOrders(rebalanceCore(reqSweep).orders);
    } catch {
      return effectiveOrders;
    }
  }, [corePreview?.req, effectiveOrders, safetyStopPendingOpts?.cashSweep]);

  const safetyStopPreviewWhatIf = useMemo(() => {
    if (!safetyStopPreviewOrders.length) return null;

    return simulateRebalanceWhatIfV0({
      cashStart: toFiniteNumber(portfolioCash) ?? 0,
      valuesBySymbol: whatIfValuesBySymbol,
      targetWeightsBySymbol: whatIfTargetWeightsPostBySymbol,
      orders: safetyStopPreviewOrders
        .filter((o) => o && o.symbol && (o.side === "BUY" || o.side === "SELL") && Number.isFinite(o.notional) && o.notional > 0)
        .map((o) => ({ symbol: o.symbol, side: o.side as "BUY" | "SELL", notional: o.notional })),
      feeBps: whatIfFeeBps,
      slippageBps: whatIfSlippageBpsUsed,
      labelsBySymbol: whatIfLabelsBySymbol});
  }, [
    portfolioCash,
    safetyStopPreviewOrders,
    whatIfFeeBps,
    whatIfLabelsBySymbol,
    whatIfSlippageBpsUsed,
    whatIfTargetWeightsPostBySymbol,
    whatIfValuesBySymbol]);

  return (
    <div id="daa-panel" className="col-12 glass card" role="region" aria-label="DAA Workflow 面板">
      {preflightOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preflight checklist"
          onClick={() => closePreflight()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 14,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.92)'}}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' as const }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 14 }}>Preflight checklist</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Before <b>{preflightPendingOpts?.cashSweep ? 'cash sweep' : 'running rebalance'}</b> (dry run).
                </div>
              </div>
              <button type="button" className="button secondary" onClick={() => closePreflight()} style={{ padding: '6px 10px' }}>
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.10)'}}
            >
              {(() => {
                const ccy = baseCcy ? ` ${baseCcy}` : '';
                const s = summarizeTradesForConfirmationV0(preflightPreviewOrders, { topN: 8 });
                const w = preflightPreviewWhatIf;

                const bits: string[] = [];
                bits.push(`orders=${s.orderCount}`);
                bits.push(`trades=${s.tradeCount} (buy=${s.buyCount}; sell=${s.sellCount})`);
                if (Number.isFinite(s.buyNotional)) bits.push(`buy≈${s.buyNotional.toFixed(2)}${ccy}`);
                if (Number.isFinite(s.sellNotional)) bits.push(`sell≈${s.sellNotional.toFixed(2)}${ccy}`);
                if (Number.isFinite(s.netNotional)) bits.push(`net≈${s.netNotional.toFixed(2)}${ccy}`);
                if (w && Number.isFinite(w.costTotal)) bits.push(`cost≈${w.costTotal.toFixed(2)}${ccy}`);

                return (
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                      Preview: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{bits.join('; ')}</span>
                    </div>

                    {s.topTrades.length ? (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: 'pointer' }}>Trades summary (largest first)</summary>
                        <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                          {s.topTrades.map((t, idx) => (
                            <div key={`${t.symbol}-${idx}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>
                              {t.side} {t.symbol} {t.notional.toFixed(2)}{ccy}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Prices</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {preflightHasPriceWarnings
                      ? `Warnings: missing=${priceDataWarningsV0.missing.length}; lastCloseFallback=${priceDataWarningsV0.lastClose.length}`
                      : 'OK: all symbols have a usable price'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: preflightHasPriceWarnings ? 'rgba(245, 158, 11, 0.20)' : 'rgba(34, 197, 94, 0.18)',
                      color: preflightHasPriceWarnings ? '#f59e0b' : '#22c55e',
                      fontSize: 12,
                      whiteSpace: 'nowrap'}}
                  >
                    {preflightHasPriceWarnings ? 'WARN' : 'OK'}
                  </span>
                  <button type="button" className="button secondary" onClick={() => closePreflightAndJump('prices')} style={{ padding: '6px 10px' }}>
                    Review
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Constraints / validation</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {preRunHasBlockingV0
                      ? `BLOCKERS detected (${preRunViolationsV0.filter((v) => v.level === 'blocker').length})`
                      : preRunHasWarningsV0
                        ? `Warnings detected (${preRunViolationsV0.filter((v) => v.level === 'warning').length})`
                        : 'OK: no blockers/warnings'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: preRunHasBlockingV0
                        ? 'rgba(239, 68, 68, 0.18)'
                        : preRunHasWarningsV0
                          ? 'rgba(245, 158, 11, 0.20)'
                          : 'rgba(34, 197, 94, 0.18)',
                      color: preRunHasBlockingV0 ? '#ef4444' : preRunHasWarningsV0 ? '#f59e0b' : '#22c55e',
                      fontSize: 12,
                      whiteSpace: 'nowrap'}}
                  >
                    {preRunHasBlockingV0 ? 'BLOCKER' : preRunHasWarningsV0 ? 'WARN' : 'OK'}
                  </span>
                  <button type="button" className="button secondary" onClick={() => closePreflightAndJump('rebalance')} style={{ padding: '6px 10px' }}>
                    Review
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Cash / settlement assumptions</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {preTradeCashCheck.blocking ? `BLOCKED: ${preTradeCashCheck.message}` : 'OK: pre-trade cash check passed'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: preTradeCashCheck.blocking ? 'rgba(239, 68, 68, 0.18)' : 'rgba(34, 197, 94, 0.18)',
                      color: preTradeCashCheck.blocking ? '#ef4444' : '#22c55e',
                      fontSize: 12,
                      whiteSpace: 'nowrap'}}
                  >
                    {preTradeCashCheck.blocking ? 'BLOCKED' : 'OK'}
                  </span>
                  <button type="button" className="button secondary" onClick={() => closePreflightAndJump('rebalance')} style={{ padding: '6px 10px' }}>
                    Review
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{preflightPendingOpts?.cashSweep ? "Cash sweep preview" : "Rebalance preview"}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {(() => {
                      const ccy = baseCcy ? ` ${baseCcy}` : "";
                      const w = preflightPreviewWhatIf;
                      const n = preflightPreviewOrders.length;

                      if (!n) return "No eligible orders under current inputs.";

                      const bits: string[] = [];
                      bits.push(`orders=${n}`);
                      if (w && Number.isFinite(w.turnoverNotional)) bits.push(`turnover≈${w.turnoverNotional.toFixed(2)}${ccy}`);
                      if (w && Number.isFinite(w.costTotal)) bits.push(`cost≈${w.costTotal.toFixed(2)}${ccy}`);
                      if (w && Number.isFinite(w.feeTotal) && Number.isFinite(w.slippageTotal))
                        bits.push(`(fee≈${w.feeTotal.toFixed(2)}${ccy}, slippage≈${w.slippageTotal.toFixed(2)}${ccy})`);
                      return bits.join("; ");
                    })()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {(() => {
                    const w = preflightPreviewWhatIf;
                    const n = preflightPreviewOrders.length;
                    const warn = (w?.warnings?.length ?? 0) > 0;
                    const status = !n ? "EMPTY" : warn ? "WARN" : "OK";
                    const bg =
                      status === "WARN"
                        ? "rgba(245, 158, 11, 0.20)"
                        : status === "EMPTY"
                          ? "rgba(100, 116, 139, 0.12)"
                          : "rgba(34, 197, 94, 0.18)";
                    const color = status === "WARN" ? "#f59e0b" : status === "EMPTY" ? "#64748b" : "#22c55e";

                    return (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: bg,
                          color,
                          fontSize: 12,
                          whiteSpace: "nowrap"}}
                        title={warn ? (w?.warnings ?? []).slice(0, 4).join("; ") : undefined}
                      >
                        {status}
                      </span>
                    );
                  })()}
                  <button type="button" className="button secondary" onClick={() => closePreflightAndJump("rebalance")} style={{ padding: "6px 10px" }}>
                    Review
                  </button>
                </div>
              </div>

              <div className="muted" style={{ fontSize: 12 }}>
                Execution mode: <b>{executionMode === 'live' ? 'live (not configured)' : 'dry run (paper)'}</b>. Dry run records orders to local execution log only.
              </div>
            </div>

            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Acknowledge</div>

              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={preflightAckPrices} onChange={(e) => setPreflightAckPrices(e.target.checked)} />
                <span className="muted" style={{ fontSize: 12 }}>
                  I verified target weights + prices. I accept any missing-price exclusions and last-close fallbacks.
                </span>
              </label>

              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={preflightAckConstraints}
                  onChange={(e) => setPreflightAckConstraints(e.target.checked)}
                />
                <span className="muted" style={{ fontSize: 12 }}>
                  I reviewed constraints/validation (blockers/warnings) and understand the risk.
                </span>
              </label>

              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={preflightAckCash} onChange={(e) => setPreflightAckCash(e.target.checked)} />
                <span className="muted" style={{ fontSize: 12 }}>
                  I reviewed cash/settlement assumptions (sell proceeds routing + cashAfter) before executing.
                </span>
              </label>

              {preRunHasBlockingV0 ? (
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={preflightOverrideBlockers}
                    onChange={(e) => setPreflightOverrideBlockers(e.target.checked)}
                  />
                  <span style={{ fontSize: 12, color: 'var(--danger)' }}>
                    Override blockers and proceed anyway (not recommended).
                  </span>
                </label>
              ) : null}
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" onClick={() => closePreflight()} style={{ padding: '6px 10px' }}>
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={() => proceedFromPreflight()}
                style={{ padding: '6px 10px' }}
                disabled={!preflightCanProceed || paperRunLoading || preTradeCashCheck.blocking || !targetWeights.length}
                title={
                  preTradeCashCheck.blocking
                    ? preTradeCashCheck.message
                    : !preflightCanProceed
                      ? 'Please acknowledge the checklist first.'
                      : undefined
                }
              >
                {preflightPendingOpts?.cashSweep ? 'Proceed & cash sweep' : 'Proceed & run rebalance'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {safetyStopOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Safety stop confirmation"
          onClick={() => closeSafetyStop()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 100%)',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 14,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.92)'}}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' as const }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 14 }}>Safety stop confirmation</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  About to <b>{safetyStopPendingOpts?.cashSweep ? 'cash sweep' : 'execute dynamic rebalance'}</b> (dry run).
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={doCopyApprovalSummaryV0}
                  style={{ padding: '6px 10px' }}
                  disabled={!safetyStopPreviewOrders.length}
                  title={!safetyStopPreviewOrders.length ? 'No orders to summarize yet.' : 'Copy a markdown approval summary (orders/costs/constraints).'}
                >
                  {copyApprovalSummaryStatus === 'ok'
                    ? 'Copied'
                    : copyApprovalSummaryStatus === 'error'
                      ? 'Copy failed'
                      : 'Copy approval summary'}
                </button>
                <button type="button" className="button secondary" onClick={() => closeSafetyStop()} style={{ padding: '6px 10px' }}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.10)' }}>
              {(() => {
                const scheduleEnabled = loadRebalanceScheduleStateV1().schedule.enabled;
                const ccy = baseCcy ? ` ${baseCcy}` : '';

                const s = summarizeTradesForConfirmationV0(safetyStopPreviewOrders, { topN: 8 });
                const w = safetyStopPreviewWhatIf;

                // Surface a cost/impact preview inside the final confirmation modal.
                const feeBpsShown = toFiniteNumber(whatIfFeeBps) ?? 0;
                const slippageBpsBaseShown = toFiniteNumber(whatIfSlippageBps) ?? 0;
                const slippageBpsUsedShown = toFiniteNumber(whatIfSlippageBpsUsed) ?? 0;

                const feeTotal = w && Number.isFinite(w.feeTotal) ? w.feeTotal : null;
                const impactTotal = w && Number.isFinite(w.slippageTotal) ? w.slippageTotal : null;
                const totalCost = w && Number.isFinite(w.costTotal) ? w.costTotal : null;

                const bits: string[] = [];
                bits.push(`orders=${s.orderCount}`);
                bits.push(`trades=${s.tradeCount} (buy=${s.buyCount}; sell=${s.sellCount})`);
                if (Number.isFinite(s.buyNotional)) bits.push(`buy≈${s.buyNotional.toFixed(2)}${ccy}`);
                if (Number.isFinite(s.sellNotional)) bits.push(`sell≈${s.sellNotional.toFixed(2)}${ccy}`);
                if (Number.isFinite(s.netNotional)) bits.push(`net≈${s.netNotional.toFixed(2)}${ccy}`);
                if (w && Number.isFinite(w.turnoverNotional)) bits.push(`turnover≈${w.turnoverNotional.toFixed(2)}${ccy}`);
                if (feeTotal !== null) bits.push(`fee≈${feeTotal.toFixed(2)}${ccy}`);
                if (impactTotal !== null) bits.push(`impact≈${impactTotal.toFixed(2)}${ccy}`);
                if (totalCost !== null) bits.push(`totalCost≈${totalCost.toFixed(2)}${ccy}`);

                return (
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                      Preview: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{bits.join('; ')}</span>
                    </div>

                    {w && feeTotal !== null && impactTotal !== null && totalCost !== null ? (
                      <div style={{ marginTop: 8 }}>
                        Simulated price impact (v0): feeBps=<b>{feeBpsShown.toFixed(1)}</b>; slippage/impactBps=<b>{slippageBpsBaseShown.toFixed(1)}</b> × sensitivity=<b>{whatIfSlippageSensitivityV0}</b> → effective=<b>{slippageBpsUsedShown.toFixed(1)}</b>. est fee≈<b>{feeTotal.toFixed(2)}</b>{ccy}; est impact≈<b>{impactTotal.toFixed(2)}</b>{ccy}; est total≈<b>{totalCost.toFixed(2)}</b>{ccy}.
                      </div>
                    ) : null}

                    {s.topTrades.length ? (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: 'pointer' }}>Trades summary (largest first)</summary>
                        <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                          {s.topTrades.map((t, idx) => (
                            <div key={`${t.symbol}-${idx}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>
                              {t.side} {t.symbol} {t.notional.toFixed(2)}{ccy}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}

                    <div style={{ marginTop: 8 }}>
                      Dynamic schedule: <b>{scheduleEnabled ? 'enabled' : 'disabled'}</b>
                    </div>
                    <div>
                      Execution: <b>{executionMode === 'live' ? 'live (not configured)' : 'dry run (paper)'}</b> — records to local execution log only.
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.10)' }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>Approval summary (orders / costs / constraints)</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                For human approval / review: copy-paste via <b>Copy approval summary</b>.
              </div>

              {(() => {
                const blockers = preRunViolationsV0.filter((v) => v.level === 'blocker');
                const warnings = preRunViolationsV0.filter((v) => v.level === 'warning');

                return (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: blockers.length ? 'var(--danger)' : warnings.length ? '#f59e0b' : 'var(--muted)' }}>
                      Constraints: {blockers.length ? `BLOCKERS=${blockers.length}` : 'ok'}
                      {warnings.length ? `; warnings=${warnings.length}` : ''}
                      {preTradeCashCheck.blocking ? ' (cash/settlement BLOCKED)' : ''}
                    </div>

                    {preflightOverrideBlockers ? (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>
                        NOTE: Override blockers is enabled.
                      </div>
                    ) : null}

                    {(blockers.length || warnings.length) ? (
                      <details className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                        <summary style={{ cursor: 'pointer' }}>Details</summary>
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          {[...blockers, ...warnings].map((v, idx) => (
                            <div key={`${v.kind}-${idx}`}>
                              <div style={{ fontWeight: 700, color: v.level === 'blocker' ? 'var(--danger)' : '#f59e0b' }}>
                                {v.level.toUpperCase()}: {v.title}
                              </div>
                              <div style={{ marginTop: 4 }}>{v.details.join(' ')}</div>
                              {v.suggestion ? <div style={{ marginTop: 4 }}>Suggestion: {v.suggestion}</div> : null}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}

                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: 'pointer' }}>Orders (full)</summary>
                      <div style={{ marginTop: 8 }}>
                        <OrdersReviewV0
                          orders={(safetyStopPreviewOrders ?? [])
                            .filter((o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0)
                            .map((o) => ({ symbol: o.symbol, side: o.side, notional: o.notional, reason: (o as any).reason }))}
                          cashStart={toFiniteNumber(portfolioCash)}
                          minTradeNotional={rebalancePolicy.minTradeNotional}
                          ccy={baseCcy}
                          feeBps={whatIfFeeBps}
                        />
                      </div>
                    </details>
                  </div>
                );
              })()}
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              If anything looks off (wrong prices/targets/orders), click "Safety stop" to disable the dynamic schedule and cancel.
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" onClick={() => closeSafetyStop()} style={{ padding: '6px 10px' }}>
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => safetyStopDisableDynamicScheduleV0()}
                style={{ padding: '6px 10px' }}
                disabled={!loadRebalanceScheduleStateV1().schedule.enabled}
                title={
                  loadRebalanceScheduleStateV1().schedule.enabled
                    ? 'Disable the local dynamic schedule and cancel this run.'
                    : 'Schedule is already disabled.'
                }
              >
                Safety stop (disable schedule)
              </button>
              <button
                type="button"
                className="button"
                onClick={() => proceedFromSafetyStop()}
                style={{ padding: '6px 10px' }}
                disabled={paperRunLoading || preTradeCashCheck.blocking || !targetWeights.length}
                title={preTradeCashCheck.blocking ? preTradeCashCheck.message : undefined}
              >
                {safetyStopPendingOpts?.cashSweep ? 'Execute cash sweep (dry run)' : 'Execute rebalance (dry run)'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' as const }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
          <span style={{ fontWeight: 800 }}>DAA Workflow</span>
          <DaaDynamicRebalanceStatusPillV0 rev={rev} />
          {driftOverviewV0.kind === 'ok' ? (
            <span
              className="badge"
              title={driftOverviewV0.title}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                borderColor: driftOverviewV0.breached ? 'var(--danger)' : '#64748b',
                color: driftOverviewV0.breached ? 'var(--danger)' : '#64748b',
                background: driftOverviewV0.breached ? 'rgba(248, 113, 113, 0.12)' : 'rgba(100, 116, 139, 0.12)'}}
            >
              Drift
              <span style={{ color: 'var(--muted)' }}>max|{driftOverviewV0.maxAbsText}|</span>
              <span style={{ color: 'var(--muted)' }}>{driftOverviewV0.label || '<unknown>'}</span>
            </span>
          ) : driftOverviewV0.kind === 'missing-targets' ? (
            <span
              className="badge"
              title={driftOverviewV0.title}
              style={{ padding: '4px 8px', fontSize: 11, borderColor: '#64748b', color: '#64748b', background: 'rgba(100, 116, 139, 0.12)' }}
            >
              Drift
              <span style={{ color: 'var(--muted)' }}>set targets</span>
            </span>
          ) : driftOverviewV0.kind === 'empty' ? (
            <span
              className="badge"
              title={driftOverviewV0.title}
              style={{ padding: '4px 8px', fontSize: 11, borderColor: '#64748b', color: '#64748b', background: 'rgba(100, 116, 139, 0.12)' }}
            >
              Drift
              <span style={{ color: 'var(--muted)' }}>n/a</span>
            </span>
          ) : null}
          <span className="muted" style={{ fontSize: 12 }}>
            Hub on Market/Funds: checklist + jump actions + import/export
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <Link href="/daa/dashboard" className="muted" style={{ fontSize: 12 }}>
            Dashboard
          </Link>
          <Link href="/daa/dashboard?tab=wizard&step=1" className="muted" style={{ fontSize: 12 }}>
            Wizard
          </Link>
          <button
            type="button"
            className={driftOverviewV0.kind === 'ok' && driftOverviewV0.breached ? 'button' : 'button secondary'}
            onClick={() => jumpTo('rebalance')}
            style={{ padding: '6px 10px' }}
            disabled={driftOverviewV0.kind === 'missing-targets'}
            title={driftOverviewV0.kind === 'missing-targets' ? driftOverviewV0.title : driftOverviewV0.kind === 'ok' ? driftOverviewV0.title : 'Jump to rebalance'}
          >
            Rebalance
          </button>

          <button
            type="button"
            className="button"
            onClick={() => runDaaRefreshAndRecommendationV0()}
            style={{ padding: '6px 10px' }}
            disabled={runDaaStatus === 'running'}
            title="One-click Run DAA: refresh Step2 market sources, then generate Step4 recommendation."
          >
            {runDaaStatus === 'running' ? 'Run DAA...' : 'Run DAA (refresh + recommendation)'}
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() => openPreflightForRun()}
            style={{ padding: '6px 10px' }}
            disabled={paperRunLoading || !targetWeights.length || preTradeCashCheck.blocking}
            title={preTradeCashCheck.blocking ? preTradeCashCheck.message : 'Manual trigger: open preflight and run a paper rebalance now.'}
          >
            {paperRunLoading ? 'Running...' : 'Manual run now'}
          </button>

          {paperRunLoading ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => paperRunAbortRef.current?.abort()}
              style={{ padding: '6px 10px' }}
              title="Abort the in-flight paper run"
            >
              Cancel run
            </button>
          ) : null}

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

      <div className="daa-mobile-actions-v0" aria-label="Funds hub quick actions">
        <div className="daa-mobile-actions-row-v0">
          <button
            type="button"
            className="button"
            onClick={() => runDaaRefreshAndRecommendationV0()}
            disabled={runDaaStatus === 'running'}
            title="One-click Run DAA: refresh Step2 market sources, then generate Step4 recommendation."
          >
            {runDaaStatus === 'running' ? 'Run DAA...' : 'Run DAA'}
          </button>
          <button type="button" className="button secondary" onClick={() => jumpTo('rebalance')}>
            Rebalance
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => openPreflightForRun()}
            disabled={paperRunLoading || !targetWeights.length || preTradeCashCheck.blocking}
            title={preTradeCashCheck.blocking ? preTradeCashCheck.message : 'Manual trigger: open preflight and run a paper rebalance now.'}
          >
            {paperRunLoading ? 'Running...' : 'Manual run'}
          </button>
          <button type="button" className="button secondary" onClick={() => jumpTo(nextJump.targetId)}>
            {nextJump.buttonText}
          </button>
        </div>
        <div className="daa-mobile-jumps-v0">
          {MOBILE_QUICK_JUMPS_V0.map((item) => (
            <button key={item.targetId} type="button" className="button secondary" onClick={() => jumpTo(item.targetId)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="daa-mobile-actions-spacer-v0" aria-hidden="true" />

      <DaaDynamicRebalanceNotificationWatcherV0 rev={rev} />
      <DaaDynamicRebalancePausedReasonBannerV0 rev={rev} />
      <DaaDynamicRebalanceLastOutcomeBannerV0 rev={rev} />
      <DaaDynamicRebalanceSkipHistoryV0 rev={rev} />

      {(() => {
        const scheduleEnabled = !!loadRebalanceScheduleStateV1().schedule.enabled;

        const missingTargets = !targetWeights.length;
        const hasPriceWarnings = priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0;

        const blockers = preRunViolationsV0.filter((v) => v.level === 'blocker');
        const warnings = preRunViolationsV0.filter((v) => v.level === 'warning');

        const cashBlocked = !!preTradeCashCheck.blocking;

        const hasBlockingIssues = missingTargets || cashBlocked || blockers.length > 0;
        const hasAnyIssues = hasBlockingIssues || hasPriceWarnings || warnings.length > 0;

        if (!hasAnyIssues) return null;

        const ui = hasBlockingIssues
          ? {
              border: 'rgba(239, 68, 68, 0.55)',
              bg: 'rgba(239, 68, 68, 0.08)',
              title: 'var(--danger)'}
          : {
              border: 'rgba(245, 158, 11, 0.55)',
              bg: 'rgba(245, 158, 11, 0.08)',
              title: '#f59e0b'};

        const title = scheduleEnabled ? 'Dynamic rebalance preflight' : 'Preflight checks';
        const subtitle = scheduleEnabled
          ? 'Schedule is enabled. Fix these before the next run.'
          : 'Fix these before running a rebalance.';

        return (
          <div
            role="alert"
            aria-label="Preflight issues"
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 12,
              border: `1px solid ${ui.border}`,
              background: ui.bg,
              fontSize: 12}}
          >
            <div style={{ fontWeight: 800, color: ui.title }}>{title}{hasBlockingIssues ? ' (action required)' : ' (review)'}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{subtitle}</div>

            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {missingTargets ? (
                <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  - Target weights missing. Dynamic rebalance can’t run until you configure targets.
                  <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <button type="button" className="button secondary" onClick={() => jumpTo('target-weights')} style={{ padding: '4px 8px' }}>
                      Set target weights
                    </button>
                    <Link href="/daa/dashboard?tab=wizard&step=4" className="muted" style={{ fontSize: 11 }}>
                      Open Step4 recommendation
                    </Link>
                  </span>
                </div>
              ) : null}

              {hasPriceWarnings ? (
                <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  - Price data warnings: missing={priceDataWarningsV0.missing.length}; lastCloseFallback={priceDataWarningsV0.lastClose.length}.
                  <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <button type="button" className="button secondary" onClick={() => jumpTo('prices')} style={{ padding: '4px 8px' }}>
                      Update prices
                    </button>
                    <Link href="/daa/dashboard?tab=wizard&step=2" className="muted" style={{ fontSize: 11 }}>
                      Open Step2 market events
                    </Link>
                  </span>
                </div>
              ) : null}

              {cashBlocked ? (
                <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  - Cash/settlement BLOCKED: <span style={{ color: 'var(--danger)' }}>{preTradeCashCheck.message}</span>
                  <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <button type="button" className="button secondary" onClick={() => jumpTo('rebalance')} style={{ padding: '4px 8px' }}>
                      Review cash routing
                    </button>
                    <Link href="/daa/dashboard?tab=wizard&step=3" className="muted" style={{ fontSize: 11 }}>
                      Edit money plan
                    </Link>
                  </span>
                </div>
              ) : null}

              {blockers.length ? (
                <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  - Constraints/validation BLOCKERS: {blockers.length}.{' '}
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{blockers.slice(0, 2).map((x) => x.title).join('; ')}</span>
                  {blockers.length > 2 ? ' …' : ''}
                  <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <button type="button" className="button secondary" onClick={() => jumpTo('rebalance')} style={{ padding: '4px 8px' }}>
                      Review blockers
                    </button>
                    <Link href="/daa/dashboard?tab=wizard&step=3" className="muted" style={{ fontSize: 11 }}>
                      Open Step3 money plan
                    </Link>
                  </span>
                </div>
              ) : null}

              {!blockers.length && warnings.length ? (
                <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  - Constraints/validation warnings: {warnings.length}.{' '}
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{warnings.slice(0, 2).map((x) => x.title).join('; ')}</span>
                  {warnings.length > 2 ? ' …' : ''}
                  <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <button type="button" className="button secondary" onClick={() => jumpTo('rebalance')} style={{ padding: '4px 8px' }}>
                      Review warnings
                    </button>
                    <Link href="/daa/dashboard?tab=wizard&step=3" className="muted" style={{ fontSize: 11 }}>
                      Open Step3 money plan
                    </Link>
                  </span>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
              {scheduleEnabled ? (
                <button type="button" className="button secondary" onClick={() => jumpTo('schedule')} style={{ padding: '4px 8px' }}>
                  Review schedule
                </button>
              ) : null}

              {!missingTargets && !cashBlocked ? (
                <button type="button" className="button secondary" onClick={() => openPreflightForRun()} style={{ padding: '4px 8px' }}>
                  Open preflight checklist
                </button>
              ) : null}
            </div>
          </div>
        );
      })()}

      <div className="muted" style={{ fontSize: 12, marginBottom: open ? 12 : 0 }}>
        <div>{headline}</div>
        <div style={{ marginTop: 4 }}>{step1SummaryText}</div>
        {runDaaStatusText ? (
          <div style={{ marginTop: 4, color: runDaaStatus === 'error' ? 'var(--danger)' : runDaaStatus === 'ok' ? '#16a34a' : 'inherit' }}>
            Run DAA: {runDaaStatusText}
          </div>
        ) : null}
      </div>

      {open ? (
        <div
          style={{
            display: 'grid',
            // Two-column density on wide screens to reduce vertical scroll in the funds hub.
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            alignItems: 'start',
            gap: 10}}
        >
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

          <div id="schedule" style={{ scrollMarginTop: 12 }}>
            <DaaRebalanceScheduleV0 />
          </div>

          <div id="notifications" style={{ scrollMarginTop: 12 }}>
            <DaaDynamicRebalanceNotificationsV0 />
          </div>

          <div id="okx-sandbox" style={{ scrollMarginTop: 12 }}>
            <DaaOkxSandboxBalancesV0 />
          </div>

          <div
            id="rebalance"
            style={{
              scrollMarginTop: 12,
              gridColumn: '1 / -1',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 12}}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ fontWeight: 800 }}>Rebalance v0</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" onClick={doCopyWeights} style={{ padding: '6px 10px' }}>
                  {copyWeightsStatus === 'ok' ? 'Copied' : copyWeightsStatus === 'error' ? 'Copy failed' : 'Copy current vs target'}
                </button>
                <button type="button" className="button" onClick={doCopyOrders} style={{ padding: '6px 10px' }} disabled={!effectiveOrders.length}>
                  {copyOrdersStatus === 'ok' ? 'Copied' : copyOrdersStatus === 'error' ? 'Copy failed' : 'Copy suggested orders'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={doExportPlanCsvV0}
                  style={{ padding: '6px 10px' }}
                  disabled={!rebalanceTableRows.length && !effectiveOrders.length}
                >
                  Export plan CSV
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
                  onClick={() => openPreflightForRun()}
                  style={{ padding: '6px 10px' }}
                  disabled={paperRunLoading || !targetWeights.length || preTradeCashCheck.blocking}
                  title={preTradeCashCheck.blocking ? preTradeCashCheck.message : undefined}
                >
                  {paperRunLoading ? 'Running...' : executionMode === 'live' ? 'Run rebalance (live)' : 'Run rebalance (dry run)'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openPreflightForRun({ cashSweep: true })}
                  style={{ padding: '6px 10px' }}
                  disabled={paperRunLoading || !targetWeights.length || preTradeCashCheck.blocking}
                  title="Sweep excess cash down toward the implicit cash buffer target (ignores drift threshold; dry run only)."
                >
                  Cash sweep (to buffer)
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
                <Link href="/daa/dashboard?tab=wizard&step=3" className="muted" style={{ fontSize: 12 }}>
                  Edit money plan
                </Link>
                <Link href="/daa/dashboard?tab=wizard&step=4" className="muted" style={{ fontSize: 12 }}>
                  Run recommendation
                </Link>
              </div>
            </div>

            <DaaRebalanceRunProgressV0 pollMs={paperRunLoading ? 250 : 750} />
            <DaaDynamicRebalanceRunCompletionToastV0 pollMs={paperRunLoading ? 250 : 750} />

            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Current = holdings × (manual price or estGsz/gsz/dwjz) + cash; Target = manual targetWeights (if configured) else engine targetWeights/money_plan.allocations; Orders = engine orders or naive diff.
              <span style={{ marginLeft: 6 }}>
                targetWeights source:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{targetWeightsSource}</span>
              </span>
            </div>

            <div
              style={{
                marginTop: 8,
                padding: '10px 12px',
                border: '1px solid rgba(59, 130, 246, 0.45)',
                borderRadius: 12,
                background: 'rgba(59, 130, 246, 0.08)'}}
              role="note"
              aria-label="Risk disclosure"
            >
              <div style={{ fontSize: 12, fontWeight: 800 }}>Risk disclosure</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                Dynamic rebalancing suggestions are generated from local inputs (holdings, prices, target weights, policy). They can be wrong and may increase turnover/costs.
              </div>
              <details style={{ marginTop: 6 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 11 }}>
                  Learn more
                </summary>
                <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6, display: 'grid', gap: 4 }}>
                  <div>- Not financial advice. Review inputs and constraints before executing.</div>
                  <div>- Data risk: stale/missing quotes, wrong symbols, rounding/lot sizes.</div>
                  <div>- Cost risk: fees, slippage/spread, taxes, min-trade constraints.</div>
                  <div>- Safety: start with dry runs; keep a cash buffer; consider cooldown.</div>
                </div>
              </details>
            </div>

            {priceDataWarningsV0.missing.length || priceDataWarningsV0.lastClose.length ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  border: '1px solid rgba(245, 158, 11, 0.55)',
                  borderRadius: 12,
                  background: 'rgba(245, 158, 11, 0.08)'}}
              >
                <div style={{ fontSize: 12, fontWeight: 800 }}>Price data warnings</div>

                {priceDataWarningsV0.missing.length ? (
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Missing price (excluded from current weights / core request):{' '}
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>
                      {priceDataWarningsV0.missing
                        .slice(0, 10)
                        .map((x) => x.sym)
                        .join(', ')}
                      {priceDataWarningsV0.missing.length > 10 ? ` (+${priceDataWarningsV0.missing.length - 10} more)` : ''}
                    </span>
                    . Fix: fill Price snapshot v0, or ensure Market/Funds quote has gsz/dwjz.
                  </div>
                ) : null}

                {priceDataWarningsV0.lastClose.length ? (
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Using last close (dwjz) fallback (real-time quote missing):{' '}
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>
                      {priceDataWarningsV0.lastClose
                        .slice(0, 10)
                        .map((x) => `${x.sym}=${x.price}`)
                        .join(', ')}
                      {priceDataWarningsV0.lastClose.length > 10 ? ` (+${priceDataWarningsV0.lastClose.length - 10} more)` : ''}
                    </span>
                    .
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                Asset blacklist
              </div>
              <input
                value={assetBlacklistTextV0}
                onChange={(e) => setAssetBlacklistTextV0(e.target.value)}
                placeholder="Comma/space separated symbols to exclude (e.g. USDT BTC 005963)"
                style={{
                  flex: '1 1 360px',
                  minWidth: 260,
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.14)'}}
                aria-label="Rebalance asset blacklist"
              />
              <div className="muted" style={{ fontSize: 11 }}>
                Excluded from holdings + targetWeights (and their prices) when generating plans.
              </div>
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 10 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                Guardrails
              </div>

              <label className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
                cash buffer (%)
                <input
                  type="number"
                  min={0}
                  max={95}
                  step={1}
                  value={Math.round(cashBucketTargetPct01 * 100)}
                  onChange={(e) => persistCashBucketTargetPct01V0(Number(e.target.value) / 100)}
                  style={{
                    width: 92,
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(0,0,0,0.14)'}}
                  aria-label="Rebalance cash buffer target percent"
                />
              </label>

              <label className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
                max turnover (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(maxTurnoverPct01V0 * 100)}
                  onChange={(e) => persistMaxTurnoverPct01V0(Number(e.target.value) / 100)}
                  style={{
                    width: 92,
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(0,0,0,0.14)'}}
                  aria-label="Rebalance max turnover percent"
                />
              </label>

              {(() => {
                const ccy = baseCcy ? ` ${baseCcy}` : '';
                const minOrder = rebalancePolicy.minTradeNotional;

                const effectiveTurnoverPct = whatIf ? whatIf.turnoverPctOfTotalBefore : null;
                const turnoverBlocked = effectiveTurnoverPct !== null && maxTurnoverPct01V0 > 0 && effectiveTurnoverPct > maxTurnoverPct01V0 + 1e-12;
                const turnoverText =
                  effectiveTurnoverPct !== null
                    ? `turnover≈${(effectiveTurnoverPct * 100).toFixed(1)}%${turnoverBlocked ? ' (exceeds)' : ''}`
                    : 'turnover≈n/a';

                return (
                  <div className="muted" style={{ fontSize: 11 }}>
                    min order≈<b>{minOrder.toFixed(2)}</b>{ccy} · investable≈<b>{(investablePct01 * 100).toFixed(0)}%</b> · {turnoverText}
                    {moneyPlanInvestablePct01 !== null ? (
                      <>
                        {' '}· money_plan investable≈{(moneyPlanInvestablePct01 * 100).toFixed(0)}%
                      </>
                    ) : (
                      <>
                        {' '}· money_plan investable: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>n/a</span>
                      </>
                    )}
                    <span className="muted">{' '}· set max turnover=0 to disable</span>
                  </div>
                );
              })()}
            </div>

            {assetBlacklistV0.length ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Active blacklist:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{assetBlacklistV0.join(', ')}</span>
              </div>
            ) : null}

            {portfolioLastRebalanceAt ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                portfolioState.lastRebalance.at:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{portfolioLastRebalanceAt}</span>
              </div>
            ) : null}

            <DaaOrderStatusTrackerV0 pollMs={paperRunLoading ? 500 : 1500} />

            {preRunViolationsV0.length ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  border: preRunHasBlockingV0
                    ? '1px solid rgba(176, 0, 32, 0.55)'
                    : preRunHasWarningsV0
                      ? '1px solid rgba(245, 158, 11, 0.55)'
                      : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  background: preRunHasBlockingV0
                    ? 'rgba(176, 0, 32, 0.08)'
                    : preRunHasWarningsV0
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(0,0,0,0.10)'}}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: preRunHasBlockingV0 ? 'var(--danger)' : 'var(--muted)' }}>
                  Constraints / validation (before execute)
                </div>

                {preRunViolationsV0.some((v) => v.level !== 'info') ? (
                  preRunViolationsV0
                    .filter((v) => v.level !== 'info')
                    .map((v, idx) => {
                      const color = v.level === 'blocker' ? 'var(--danger)' : '#f59e0b';
                      return (
                        <div key={`${v.kind}-${idx}`} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color }}>
                            {v.level.toUpperCase()}: {v.title}
                          </div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                            {v.details.join(' ')}
                          </div>
                          {v.suggestion ? (
                            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                              Suggestion: {v.suggestion}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                ) : (
                  <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                    No blockers detected for current inputs.
                  </div>
                )}

                {preRunViolationsV0.some((v) => v.level === 'info') ? (
                  <details className="muted" style={{ marginTop: 10, fontSize: 11 }}>
                    <summary style={{ cursor: 'pointer' }}>More details</summary>
                    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                      {preRunViolationsV0
                        .filter((v) => v.level === 'info')
                        .map((v, idx) => (
                          <div key={`info-${v.kind}-${idx}`}>
                            <div style={{ fontWeight: 700 }}>{v.title}</div>
                            <div style={{ marginTop: 4 }}>{v.details.join(' ')}</div>
                          </div>
                        ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}

            {effectiveOrders.length ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  border: preTradeCashCheck.blocking ? '1px solid rgba(176, 0, 32, 0.5)' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  background: preTradeCashCheck.blocking ? 'rgba(176, 0, 32, 0.08)' : 'rgba(0,0,0,0.10)'}}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: preTradeCashCheck.blocking ? 'var(--danger)' : 'var(--muted)' }}>
                  Pre-trade cash/settlement check {preTradeCashCheck.blocking ? '(BLOCKED)' : '(ok)'}
                </div>

                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                  <div className="muted" style={{ fontSize: 11 }}>Sell proceeds routing:</div>
                  <select
                    value={sellProceedsRoutingV0}
                    onChange={(e) => persistSellProceedsRoutingV0(e.target.value)}
                    style={{
                      fontSize: 12,
                      padding: '4px 6px',
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.15)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'inherit'}}
                  >
                    <option value="TARGET_CASH_BUCKET">Target cash bucket (conservative, T+1/T+2)</option>
                    <option value="CASH">Cash (allow sells to fund buys)</option>
                  </select>
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
                    {sellProceedsRoutingV0 === 'CASH'
                      ? 'Assumption: sell proceeds can fund BUY orders (T+0-style settlement).' 
                      : 'Assumption: sell proceeds may settle later (T+1/T+2), so BUY notional must be covered by starting cash.'}
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
                  background: 'rgba(0, 170, 119, 0.08)'}}
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

                {paperRunPostSummary?.allocationDiffRowsV0?.length ? (
                  <AllocationDiffChartV0 rows={paperRunPostSummary.allocationDiffRowsV0} />
                ) : null}

                {paperRunPostSummary?.warnings?.length ? (
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    What-if warnings: {paperRunPostSummary.warnings.slice(0, 2).join('; ')}
                  </div>
                ) : null}

                {paperRunPostSummary?.orderBreakdownRowsV0?.length ? (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>Asset-level order breakdown (qty + est fee/slippage)</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      qty≈notional/price; BUY uses (notional - fee - slippage)/price. fee/slippage are estimated from the what-if bps.
                    </div>

                    {(() => {
                      const rows = paperRunPostSummary.orderBreakdownRowsV0;
                      const feeTotal = rows.reduce((acc, r) => acc + (Number.isFinite(r.feeEst) ? r.feeEst : 0), 0);
                      const slippageTotal = rows.reduce((acc, r) => acc + (Number.isFinite(r.slippageEst) ? r.slippageEst : 0), 0);
                      const costTotal = rows.reduce((acc, r) => acc + (Number.isFinite(r.costEst) ? r.costEst : 0), 0);
                      const ccy = baseCcy ? ` ${baseCcy}` : '';

                      return (
                        <>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            est fee≈<b>{feeTotal.toFixed(2)}</b>{ccy} · est slippage≈<b>{slippageTotal.toFixed(2)}</b>{ccy} · est totalCost≈<b>{costTotal.toFixed(2)}</b>{ccy}
                          </div>

                          <div style={{ marginTop: 8, overflowX: 'auto' as const }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Asset</th>
                                  <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Side</th>
                                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Price</th>
                                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Notional</th>
                                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Qty</th>
                                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Est fee</th>
                                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Est slippage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => {
                                  const sideColor = r.side === 'BUY' ? 'var(--primary)' : 'var(--danger)';
                                  const qty = r.qty;
                                  const qtyText = qty === null || !Number.isFinite(qty) ? 'n/a' : qty >= 1 ? qty.toFixed(4) : qty.toFixed(6);
                                  const priceText = r.price === null || !Number.isFinite(r.price) ? 'n/a' : r.price.toFixed(6);

                                  return (
                                    <tr key={r.id}>
                                      <td style={{ padding: '6px 0' }}>
                                        {r.label} <span className="muted">({r.symbol})</span>
                                      </td>
                                      <td style={{ padding: '6px 0', color: sideColor, fontWeight: 700 }}>{r.side}</td>
                                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{priceText}</td>
                                      <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                        {r.notional.toFixed(2)}{ccy}
                                      </td>
                                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{qtyText}</td>
                                      <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                        {r.feeEst.toFixed(2)}{ccy}
                                      </td>
                                      <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                        {r.slippageEst.toFixed(2)}{ccy}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
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
                            color: '#fff'}}
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
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  border: '1px solid rgba(176, 0, 32, 0.55)',
                  borderRadius: 12,
                  background: 'rgba(176, 0, 32, 0.08)'}}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--danger)' }}>Run failed</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                    <button
                      type="button"
                      className="button secondary"
                      style={{ padding: '4px 8px' }}
                      disabled={paperRunLoading || !paperRunLastConfirmedOpts}
                      onClick={() => {
                        if (!paperRunLastConfirmedOpts) return;
                        void runPaperRebalanceCore(paperRunLastConfirmedOpts);
                      }}
                      title={!paperRunLastConfirmedOpts ? 'No confirmed run to retry yet.' : 'Retry the last confirmed run (same mode/options).'}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      style={{ padding: '4px 8px' }}
                      disabled={paperRunLoading}
                      onClick={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})}
                      title="Re-open preflight checklist before retrying."
                    >
                      Review & retry
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--danger)' }}>{paperRunError}</div>

                {paperRunFailureDetails ? (
                  <details className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                    <summary style={{ cursor: 'pointer' }}>Failure details</summary>
                    <pre style={{ margin: '8px 0 0', overflowX: 'auto' }}>{paperRunFailureDetails}</pre>
                  </details>
                ) : null}
              </div>
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
                  background: 'rgba(0,0,0,0.12)'}}
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
                  {(() => {
                    const pct = Math.max(0, driftThresholdPct * 100);
                    const policyPct = Math.max(0, policyDriftThresholdPct * 100);
                    const overrideActive = whatIfDriftThresholdPctV0 !== null;

                    const setPct = (pct100: number | null) => {
                      if (pct100 === null) {
                        setWhatIfDriftThresholdPctV0(null);
                        return;
                      }
                      const v = Number(pct100);
                      if (!Number.isFinite(v) || v < 0) return;
                      setWhatIfDriftThresholdPctV0(v / 100);
                    };

                    const presets = [
                      { id: 'conservative', label: 'Conservative', pct100: 2.0, title: '2.00% (fewer rebalances)' },
                      { id: 'standard', label: 'Standard', pct100: 1.0, title: '1.00% (default-ish)' },
                      { id: 'aggressive', label: 'Aggressive', pct100: 0.5, title: '0.50% (more rebalances)' }] as const;

                    const activePresetId = presets.find((p) => Math.abs(pct - p.pct100) < 1e-6)?.id ?? null;

                    return (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', marginLeft: 4 }}>
                        <span className="muted" style={{ fontSize: 12 }}>threshold</span>
                        <span className="muted" style={{ fontSize: 12 }}>presets</span>
                        {presets.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={activePresetId === p.id ? 'button' : 'button secondary'}
                            onClick={() => setPct(p.pct100)}
                            style={{ padding: '4px 8px' }}
                            title={p.title}
                            aria-pressed={activePresetId === p.id}
                          >
                            {p.label}
                          </button>
                        ))}
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={0.1}
                          value={pct}
                          onChange={(e) => {
                            const v = toFiniteNumber((e.target as HTMLInputElement).value);
                            if (v === null) return;
                            setPct(v);
                          }}
                          style={{ width: 160 }}
                          aria-label="What-if drift threshold percent"
                        />
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={0.1}
                          value={pct.toFixed(2)}
                          onChange={(e) => {
                            const v = toFiniteNumber((e.target as HTMLInputElement).value);
                            if (v === null) return;
                            setPct(v);
                          }}
                          style={{ width: 84, padding: '4px 6px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}
                        />
                        <span className="muted" style={{ fontSize: 12 }}>%</span>
                        {overrideActive ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => setPct(null)}
                            style={{ padding: '4px 8px' }}
                          >
                            Reset
                          </button>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>
                            policy={policyPct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    );
                  })()}
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
                    feeBps={whatIfFeeBps}
                  />

                  {effectiveEngineWarnings.length ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "8px 10px",
                        border: "1px solid rgba(176,0,32,0.35)",
                        borderRadius: 10,
                        background: "rgba(176,0,32,0.08)"}}
                    >
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Engine warnings</div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {effectiveEngineWarnings.slice(0, 6).map((w, idx) => (
                          <div key={idx} style={{ fontSize: 12, color: "var(--danger, #b00020)" }}>
                            {w}
                          </div>
                        ))}
                      </div>
                      {effectiveEngineWarnings.length > 6 ? (
                        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                          +{effectiveEngineWarnings.length - 6} more warnings...
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {effectiveEngineNotes.length ? (
                    <details className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                      <summary style={{ cursor: "pointer" }}>Engine notes</summary>
                      <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                        {effectiveEngineNotes.slice(0, 10).map((n, idx) => (
                          <div key={idx}>{n}</div>
                        ))}
                      </div>
                      {effectiveEngineNotes.length > 10 ? (
                        <div style={{ fontSize: 11, marginTop: 6 }}>+{effectiveEngineNotes.length - 10} more notes...</div>
                      ) : null}
                    </details>
                  ) : null}

                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Trade rationale (why each trade)</summary>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Uses current vs target drift (best-effort) and the engine-provided per-order reason.
                    </div>

                    <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                      {tradeRationaleRowsV0.map((r) => {
                        const ccy = baseCcy ? ` ${baseCcy}` : '';
                        const driftKind =
                          r.driftPct === null ? null : r.driftPct >= driftThresholdPct ? 'over' : r.driftPct <= -driftThresholdPct ? 'under' : 'ok';
                        const driftAbsPct = r.driftPct === null ? null : (Math.abs(r.driftPct) * 100).toFixed(1);
                        const badgeText =
                          driftKind === null
                            ? 'NO DRIFT'
                            : driftKind === 'over'
                              ? `OVER +${driftAbsPct}%`
                              : driftKind === 'under'
                                ? `UNDER -${driftAbsPct}%`
                                : `OK ${driftAbsPct}%`;
                        const badgeColor =
                          driftKind === 'over' ? 'var(--danger)' : driftKind === 'under' ? 'var(--primary)' : 'var(--muted)';

                        return (
                          <div
                            key={r.key}
                            style={{
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 10,
                              padding: '8px 10px',
                              background: 'rgba(0,0,0,0.08)'}}
                          >
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                              <span className="badge" style={{ padding: '2px 8px', fontSize: 11 }}>
                                {r.side}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: 12 }}>
                                {r.label} <span className="muted">({r.symbol})</span>
                              </span>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {Number.isFinite(r.notional) ? r.notional.toFixed(2) : String(r.notional)}{ccy}
                              </span>
                              {r.notionalPct !== null ? (
                                <span className="badge" style={{ padding: '2px 8px', fontSize: 11, borderColor: badgeColor, color: badgeColor, background: 'rgba(0,0,0,0.12)' }}>
                                  {(r.notionalPct * 100).toFixed(2)}% equity
                                </span>
                              ) : null}
                              {r.driftPct !== null ? (
                                <span
                                  className="badge"
                                  style={{ padding: '2px 8px', fontSize: 11, borderColor: badgeColor, color: badgeColor, background: 'rgba(0,0,0,0.12)' }}
                                  title="currentPct - targetPct"
                                >
                                  {badgeText}
                                </span>
                              ) : null}
                            </div>

                            {r.driftPct !== null && r.currentPct !== null && r.targetPct !== null ? (
                              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                                Drift: current={(r.currentPct * 100).toFixed(1)}% vs target={(r.targetPct * 100).toFixed(1)}% (delta={(r.driftPct * 100).toFixed(1)}%)
                              </div>
                            ) : null}

                            {r.reason ? (
                              <div style={{ fontSize: 12, marginTop: 6 }}>{r.reason}</div>
                            ) : (
                              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                No reason available.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', marginTop: 8 }}>
                    <span className="muted" style={{ fontSize: 11 }}>Preview orders:</span>

                    <button
                      type="button"
                      className={ordersPreviewSourceV0 === 'RECOMPUTE' ? 'button' : 'button secondary'}
                      onClick={() => setOrdersPreviewSourceV0('RECOMPUTE')}
                      style={{ padding: '4px 8px' }}
                      aria-pressed={ordersPreviewSourceV0 === 'RECOMPUTE'}
                      title="Recompute orders via the core engine using current inputs + threshold"
                    >
                      Recompute
                    </button>

                    <button
                      type="button"
                      className={ordersPreviewSourceV0 === 'ENGINE_LAST_RUN' ? 'button' : 'button secondary'}
                      onClick={() => setOrdersPreviewSourceV0('ENGINE_LAST_RUN')}
                      style={{ padding: '4px 8px' }}
                      aria-pressed={ordersPreviewSourceV0 === 'ENGINE_LAST_RUN'}
                      disabled={!engineOrders.length}
                      title="Use orders from the last core run (saved in localStorage)"
                    >
                      Last run (core)
                    </button>

                    <span className="muted" style={{ fontSize: 11 }}>
                      {ordersPreviewSourceV0 === 'ENGINE_LAST_RUN'
                        ? 'Using saved engine orders; adjust threshold then re-run core to refresh.'
                        : 'Computed by core; adjusts with the threshold slider.'}
                    </span>
                  </div>

                  {ordersPreviewSourceV0 === 'RECOMPUTE' && !corePreview?.resp && naiveOrdersDiagnostics && naiveOrdersDiagnostics.suppressedCount ? (
                    <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                      {(() => {
                        const ccy = baseCcy ? ` ${baseCcy}` : '';
                        const top = (naiveOrdersDiagnostics.suppressedTop || [])
                          .map((x) => `${x.side} ${x.id}: raw=${x.rawNotional.toFixed(2)}${ccy} → rounded=${x.roundedNotional.toFixed(2)}${ccy}`)
                          .join('; ');

                        return (
                          <>
                            Min trade/precision: suppressed {naiveOrdersDiagnostics.suppressedCount} candidate trade(s) below minNotional={naiveOrdersDiagnostics.minNotional.toFixed(2)}{ccy}
                            {naiveOrdersDiagnostics.lotStep > 0 ? ` (lotStep=${naiveOrdersDiagnostics.lotStep.toFixed(2)}${ccy})` : ''}.
                            {top ? ` Examples: ${top}.` : ''}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}

                  {whatIf ? (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>What-if preview (fees/slippage + expected drift)</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        Costs model (v0): BUY acquires (notional - cost); SELL receives (notional - cost); cost = feeBps + slippage/spreadBps(base) * sensitivity.
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: 12,
                          padding: '10px 12px',
                          background: 'rgba(0,0,0,0.12)'}}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12 }}>Impact summary (preview)</div>
                        {(() => {
                          const ccy = baseCcy ? ` ${baseCcy}` : '';
                          const trades = effectiveOrders.filter(
                            (o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0
                          ).length;

                          let maxAbsDriftAfterPct01: number | null = null;
                          for (const r of whatIfRows) {
                            const abs = Math.abs(r.driftPct);
                            if (!Number.isFinite(abs)) continue;
                            maxAbsDriftAfterPct01 = maxAbsDriftAfterPct01 === null ? abs : Math.max(maxAbsDriftAfterPct01, abs);
                          }

                          const turnoverPct01 = Number.isFinite(whatIf.turnoverPctOfTotalBefore) ? whatIf.turnoverPctOfTotalBefore : null;

                          return (
                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const, marginTop: 6 }}>
                              <div style={{ minWidth: 140 }}>
                                <div className="muted" style={{ fontSize: 11 }}>trades</div>
                                <div style={{ fontSize: 13, fontWeight: 800 }}>{trades}</div>
                              </div>
                              <div style={{ minWidth: 220 }}>
                                <div className="muted" style={{ fontSize: 11 }}>turnover</div>
                                <div style={{ fontSize: 13, fontWeight: 800 }}>
                                  {whatIf.turnoverNotional.toFixed(2)}{ccy}{turnoverPct01 !== null ? ` (${fmtPct01(turnoverPct01)})` : ''}
                                </div>
                              </div>
                              <div style={{ minWidth: 200 }}>
                                <div className="muted" style={{ fontSize: 11 }}>max|drift| after</div>
                                <div style={{ fontSize: 13, fontWeight: 800 }}>
                                  {maxAbsDriftAfterPct01 !== null ? fmtPct01(maxAbsDriftAfterPct01) : 'n/a'}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: 12,
                          padding: '10px 12px',
                          background: 'rgba(0,0,0,0.12)'}}
                      >
                        <div style={{ fontWeight: 700, fontSize: 12 }}>Cash impact breakdown (preview)</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                          BUY spends full notional cash (cost reduces acquired value). SELL receives proceeds net of fee+slippage.
                        </div>

                        {(() => {
                          const ccy = baseCcy ? ` ${baseCcy}` : '';

                          const cashDelta = whatIf.cashAfter - whatIf.cashBefore;
                          const cashDeltaPct = whatIf.cashBefore > 0 ? cashDelta / whatIf.cashBefore : null;
                          const deltaColor = cashDelta < 0 ? 'var(--danger)' : 'var(--text)';

                          const buy = whatIf.buyCashOutflow;
                          const sellGross = whatIf.sellProceedsGross;
                          const sellNet = whatIf.sellProceedsNet;

                          const cashAfterImplied = whatIf.cashBefore + sellNet - buy;
                          const cashEqOk = Math.abs(cashAfterImplied - whatIf.cashAfter) <= 1e-6;

                          return (
                            <>
                              <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                                <div style={{ minWidth: 200 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>cashBefore</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{whatIf.cashBefore.toFixed(2)}{ccy}</div>
                                </div>

                                <div style={{ minWidth: 240 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>+ sell proceeds (net)</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{sellNet.toFixed(2)}{ccy}</div>
                                </div>

                                <div style={{ minWidth: 240 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>- buy cash outflow (gross)</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{buy.toFixed(2)}{ccy}</div>
                                </div>

                                <div style={{ minWidth: 200 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>cashAfter</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{whatIf.cashAfter.toFixed(2)}{ccy}</div>
                                </div>
                              </div>

                              <div style={{ marginTop: 8, fontSize: 12, color: deltaColor }}>
                                cashDelta={cashDelta.toFixed(2)}{ccy}
                                {cashDeltaPct !== null ? ` (${(cashDeltaPct * 100).toFixed(2)}%)` : ''}
                                <span className="muted">{' '}= cashAfter - cashBefore</span>
                              </div>

                              <details className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                                <summary style={{ cursor: 'pointer' }}>Details</summary>
                                <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                                  sellGross={sellGross.toFixed(2)}{ccy}; sellCost≈{whatIf.costSellTotal.toFixed(2)}{ccy}; buyCost≈{whatIf.costBuyTotal.toFixed(2)}{ccy}.{' '}
                                  <span className="muted">Check: cashAfter ≈ cashBefore + sellNet - buy</span>
                                  {!cashEqOk ? <span style={{ color: 'var(--danger)' }}>{' '} (mismatch; check inputs)</span> : null}
                                </div>
                              </details>
                            </>
                          );
                        })()}
                      </div>

                      {taxLotsImpactV0 ? (
                        <div
                          style={{
                            marginTop: 8,
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 12,
                            padding: '10px 12px',
                            background: 'rgba(0,0,0,0.12)'}}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12 }}>Tax-lot / realized gain impact (preview)</div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                            Estimates realized gain for SELL legs using portfolio tax lots (FIFO by acquiredAt) or avg cost. Uses SELL proceeds net of fee+slippage (costBps).
                          </div>

                          {(() => {
                            const ccy = baseCcy ? ` ${baseCcy}` : '';
                            const g = taxLotsImpactV0.totals.realizedGainKnown;
                            const color = g < 0 ? 'var(--danger)' : 'var(--text)';

                            return (
                              <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                                <div style={{ minWidth: 220 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>realizedGain (known)</div>
                                  <div style={{ fontSize: 13, fontWeight: 800, color }}>{g.toFixed(2)}{ccy}</div>
                                </div>
                                <div style={{ minWidth: 220 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>proceedsNet (known+unknown)</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{taxLotsImpactV0.totals.proceedsNet.toFixed(2)}{ccy}</div>
                                </div>
                                <div style={{ minWidth: 220 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>costBasis (known)</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{taxLotsImpactV0.totals.costBasisKnown.toFixed(2)}{ccy}</div>
                                </div>
                                <div style={{ minWidth: 220 }}>
                                  <div className="muted" style={{ fontSize: 11 }}>qty missing cost basis</div>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>{taxLotsImpactV0.totals.qtyUnknown.toFixed(4)}</div>
                                </div>
                              </div>
                            );
                          })()}

                          {taxLotsImpactV0.warnings.length ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                              {taxLotsImpactV0.warnings.slice(0, 6).join(' · ')}
                              {taxLotsImpactV0.warnings.length > 6 ? ' · ...' : ''}
                            </div>
                          ) : null}

                          {taxLotsImpactV0.rows.length ? (
                            <details className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                              <summary style={{ cursor: 'pointer' }}>Details (per SELL order)</summary>
                              <div style={{ marginTop: 6, overflowX: 'auto' as const }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Symbol</th>
                                      <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Qty est</th>
                                      <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Price</th>
                                      <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Proceeds net</th>
                                      <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Cost basis (known)</th>
                                      <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Realized gain (known)</th>
                                      <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Qty unknown</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {taxLotsImpactV0.rows.map((r, idx) => {
                                      const ccy = baseCcy ? ` ${baseCcy}` : '';
                                      const color = r.realizedGainKnown < 0 ? 'var(--danger)' : 'var(--text)';

                                      return (
                                        <tr key={`${r.symbol}-${idx}`}>
                                          <td style={{ padding: '6px 0' }}>{r.symbol}</td>
                                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{r.qtyEst.toFixed(4)}</td>
                                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{r.price.toFixed(4)}</td>
                                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{r.proceedsNet.toFixed(2)}{ccy}</td>
                                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{r.costBasisKnown.toFixed(2)}{ccy}</td>
                                          <td style={{ padding: '6px 0', textAlign: 'right', color }}>{r.realizedGainKnown.toFixed(2)}{ccy}</td>
                                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{r.qtyUnknown.toFixed(4)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          ) : null}
                        </div>
                      ) : null}

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
                                  cursor: 'pointer'}}
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

                      {whatIfAllocationDiffRowsV0.length ? (
                        <AllocationDiffChartV0
                          rows={whatIfAllocationDiffRowsV0}
                          title="What changed (current vs proposed)"
                          description="Before/After bars are weights vs total portfolio (including cash). Dashed marker = proposed target weight."
                        />
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
                <div style={{ fontSize: 12 }}>
                  {(() => {
                    const ccy = baseCcy ? ` ${baseCcy}` : '';
                    const diag = ordersPreviewSourceV0 === 'RECOMPUTE' && !corePreview?.resp ? naiveOrdersDiagnostics : null;

                    // If we expected orders (drift exceeds threshold) but none were produced, surface a blocker.
                    if (diag && diag.candidateCount > 0 && diag.producedCount === 0) {
                      const examples = (diag.suppressedTop || [])
                        .map((x) => `${x.side} ${x.id}: raw=${x.rawNotional.toFixed(2)}${ccy} → rounded=${x.roundedNotional.toFixed(2)}${ccy}`)
                        .join('; ');

                      return (
                        <div>
                          <div style={{ color: 'var(--danger, #b00020)' }}>
                            Blocked by min trade/precision: {diag.candidateCount} candidate trade(s), but all are below minNotional={diag.minNotional.toFixed(2)}{ccy}
                            {diag.lotStep > 0 ? ` (lotStep=${diag.lotStep.toFixed(2)}${ccy})` : ''}.
                          </div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                            Suggestion: lower policy.minTradeNotional, or increase position size/equity so the implied notional deltas exceed the minimum.
                          </div>
                          {examples ? (
                            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                              Examples: {examples}.
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    if (diag && diag.candidateCount === 0) {
                      return (
                        <div className="muted">
                          No orders: all drifts are within threshold ({(driftThresholdPct * 100).toFixed(2)}%). Lower the threshold if you expect more rebalances.
                        </div>
                      );
                    }

                    return (
                      <div className="muted">
                        暂无 orders：请先跑一次 Step4，或确保 current vs target 数据齐全。（minTradeNotional={rebalancePolicy.minTradeNotional.toFixed(2)}）
                      </div>
                    );
                  })()}
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
              padding: 12}}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" as const }}>
              <div style={{ fontWeight: 800 }}>Auto plan v0</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 12 }}>Scenario</span>
                  <button
                    type="button"
                    className={autoPlanScenario === 'A' ? 'button' : 'button secondary'}
                    onClick={() => setAutoPlanScenario('A')}
                    style={{ padding: "6px 10px" }}
                    title="Scenario A"
                  >
                    A
                  </button>
                  <button
                    type="button"
                    className={autoPlanScenario === 'B' ? 'button' : 'button secondary'}
                    onClick={() => setAutoPlanScenario('B')}
                    style={{ padding: "6px 10px" }}
                    title="Scenario B"
                  >
                    B
                  </button>
                </div>

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
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                <div className="muted" style={{ fontSize: 12 }}>Trigger threshold (%)</div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={autoPlanThresholdOverridePct === null ? "" : String((autoPlanThresholdOverridePct * 100).toFixed(2))}
                  placeholder={String((driftThresholdPct * 100).toFixed(2))}
                  onChange={(e) => {
                    const v = String(e.target.value ?? '').trim();
                    if (!v) {
                      setAutoPlanThresholdOverridePctForActive(null);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isFinite(n) || n < 0) return;
                    setAutoPlanThresholdOverridePctForActive(n / 100);
                  }}
                  style={{
                    width: 120,
                    fontFamily: "ui-monospace, SFMono-Regular",
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(127,127,127,0.35)",
                    background: "rgba(0,0,0,0.12)"}}
                  title="Override drift threshold for this scenario only (percent)"
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setAutoPlanThresholdOverridePctForActive(null)}
                  disabled={autoPlanThresholdOverridePct === null}
                  style={{ padding: "6px 10px" }}
                  title="Clear per-scenario override"
                >
                  Use global
                </button>
                <div className="muted" style={{ fontSize: 11 }}>
                  used={(autoPlanThresholdPctUsed * 100).toFixed(2)}%; global={(driftThresholdPct * 100).toFixed(2)}%
                </div>
              </div>

              <textarea
                value={autoPlanInputText}
                onChange={(e) => setAutoPlanInputTextForActive(e.target.value)}
                rows={8}
                placeholder={"Paste {seriesBySymbol: {...}} or {snapshots:[{date,prices}]}"}
                style={{
                  width: "100%",
                  fontFamily: "ui-monospace, SFMono-Regular",
                  fontSize: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(127,127,127,0.35)",
                  background: "rgba(0,0,0,0.12)"}}
              />

              {autoPlanError ? <div style={{ fontSize: 12, color: "var(--danger, #b00020)" }}>{autoPlanError}</div> : null}

              {autoPlanResultA && autoPlanResultB ? (
                <details style={{ marginTop: 6, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Compare scenarios (A vs B)</summary>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr 1fr", gap: 10, fontSize: 12, alignItems: "baseline" }}>
                      <div />
                      <div style={{ fontWeight: 800 }}>A</div>
                      <div style={{ fontWeight: 800 }}>B</div>
                      <div className="muted">Δ (B-A)</div>

                      <div className="muted">rebalanceCount</div>
                      <div>{autoPlanResultA.summary.rebalanceCount}</div>
                      <div>{autoPlanResultB.summary.rebalanceCount}</div>
                      <div className="muted">{autoPlanResultB.summary.rebalanceCount - autoPlanResultA.summary.rebalanceCount}</div>

                      <div className="muted">turnoverNotional</div>
                      <div>{autoPlanResultA.summary.turnoverNotional.toFixed(2)}{baseCcy ? ` ${baseCcy}` : ''}</div>
                      <div>{autoPlanResultB.summary.turnoverNotional.toFixed(2)}{baseCcy ? ` ${baseCcy}` : ''}</div>
                      <div className="muted">{(autoPlanResultB.summary.turnoverNotional - autoPlanResultA.summary.turnoverNotional).toFixed(2)}{baseCcy ? ` ${baseCcy}` : ''}</div>

                      <div className="muted">finalEquityAbs</div>
                      <div>{autoPlanResultA.summary.finalEquityAbs.toFixed(2)}</div>
                      <div>{autoPlanResultB.summary.finalEquityAbs.toFixed(2)}</div>
                      <div className="muted">{(autoPlanResultB.summary.finalEquityAbs - autoPlanResultA.summary.finalEquityAbs).toFixed(2)}</div>
                    </div>

                    {autoPlanResultA.states?.final && autoPlanResultB.states?.final ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Final weights diff (A → B)</div>
                        <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                          {formatWeightsDiffLines({ before: autoPlanResultA.states.final, after: autoPlanResultB.states.final }).join("\n")}
                        </pre>
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 11 }}>
                        (Missing states.final for at least one scenario; re-generate to compare weight diffs.)
                      </div>
                    )}
                  </div>
                </details>
              ) : autoPlanResultA || autoPlanResultB ? (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Tip: generate both Scenario A and Scenario B to compare.
                </div>
              ) : null}

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

                  {autoPlanResult.warnings?.length ? (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--danger, #b00020)' }}>
                        Warnings ({autoPlanResult.warnings.length})
                      </summary>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger, #b00020)' }}>
                        {autoPlanResult.warnings.map((w, idx) => (
                          <div key={idx}>{String(w)}</div>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  {autoPlanResult.states ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Overall diff (initial → final)</div>
                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
                        {formatWeightsDiffLines({ before: autoPlanResult.states.initial, after: autoPlanResult.states.final }).join("\n")}
                      </pre>
                    </div>
                  ) : null}


                  {Array.isArray((autoPlanResult as any).timeline) && (autoPlanResult as any).timeline.length ? (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12 }}>
                        Timeline (drift over time) ({(autoPlanResult as any).timeline.length})
                      </summary>
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {(autoPlanResult as any).timeline.map((pt: any, idx: number) => {
                          const stats: any = pt?.trigger?.stats ?? {};
                          const maxAbs = Number(stats.maxAbsDriftPct ?? NaN);
                          const threshold = Number(stats.thresholdPct ?? autoPlanThresholdPctUsed);
                          const ratio = threshold > 0 && Number.isFinite(maxAbs) ? Math.min(1, Math.max(0, maxAbs / threshold)) : 0;
                          const hit = !!pt?.trigger?.shouldRebalance;
                          const top = Array.isArray(pt?.topAbsDriftsPct01) ? pt.topAbsDriftsPct01.slice(0, 3) : [];

                          return (
                            <div
                              key={`${pt?.date ?? idx}-${idx}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "110px 1fr 90px",
                                gap: 10,
                                alignItems: "center"}}
                            >
                              <div style={{ fontFamily: "ui-monospace, SFMono-Regular", fontSize: 11 }}>{String(pt?.date ?? "")}</div>
                              <div style={{ height: 10, borderRadius: 999, background: "rgba(127,127,127,0.25)", overflow: "hidden" }}>
                                <div
                                  style={{
                                    width: `${(ratio * 100).toFixed(1)}%`,
                                    height: "100%",
                                    background: hit ? "rgba(176,0,32,0.8)" : "rgba(64,160,255,0.7)"}}
                                />
                              </div>
                              <div style={{ fontSize: 11, textAlign: "right" as const }}>
                                <span className={hit ? "" : "muted"} style={{ fontWeight: hit ? 800 : 400 }}>
                                  {fmtPct01(maxAbs)}
                                </span>
                              </div>

                              <div style={{ gridColumn: "1 / -1", fontSize: 11 }} className="muted">
                                threshold={fmtPct01(threshold)}
                                {String(stats.maxAbsDriftSymbol ?? "") ? `; maxSym=${String(stats.maxAbsDriftSymbol)}` : ""}; eligibleOrders={String(stats.eligibleOrderCount ?? "-")}; shouldRebalance={String(hit)}
                                {top.length
                                  ? `; top=${top
                                      .map((x: any) => `${String(x?.symbol ?? "")}:${fmtPct01(Number(x?.absDriftPct01 ?? NaN))}`)
                                      .filter(Boolean)
                                      .join(", " )}`
                                  : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
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
                                  feeBps={whatIfFeeBps}
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


          <div id="dynamic-rebalance-run-history" style={{ scrollMarginTop: 12 }}>
            <DaaDynamicRebalanceRunHistoryV0 rev={rev} />
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

          <div id="step3" style={{ scrollMarginTop: 12 }}>
            <Step3MoneyManagementPage />
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
