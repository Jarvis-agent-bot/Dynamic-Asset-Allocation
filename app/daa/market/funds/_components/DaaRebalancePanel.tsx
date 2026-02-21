'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { copyTextToClipboard } from '../../../copyToClipboard';
import { pushDynamicRebalanceNotificationV0 } from '../../../dynamicRebalanceNotificationsClientV0';
import { LS_LEGACY_HOLDINGS, loadPortfolioStateV1, recordPortfolioLastRebalance, savePortfolioStateV1 } from '../../../portfolioStateStore';
import { loadPriceSnapshotV1, savePriceSnapshotV1 } from '../../../priceSnapshotStore';
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
import { getLiquiditySettlementGateV0 } from '@/src/daa/liquiditySettlementGateV0';
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
import { MARKET_FUNDS_QUICK_JUMPS_V0 } from '@/src/daa/keyboardFocusMapV0';
import {
  computeDriftAlertFromCoreResponse,
  computeDriftAlertFromTableRows,
  downloadTextAsFile,
  fmtPct01,
  formatOrdersMarkdown,
  formatWeightsMarkdown,
  normalizeOrders,
  normalizeTargetWeights,
  normalizeTargetWeightsAny,
  pickFundNav,
  resolveFundPriceV0,
  scrollToId,
  toFiniteNumber,
  type DriftAlertV0,
  type PaperRunHealthcheckV0,
  type SuggestedOrder,
  type TargetWeight,
} from './DaaRebalancePanel.helpersV0';
import { buildTargetedDecisionTransparencyV0 } from '@/src/daa/targetedDecisionTransparencyV0';
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
import DaaTargetedDecisionTransparencyCardV0 from './DaaTargetedDecisionTransparencyCardV0';
import DaaOkxSandboxBalancesV0 from './DaaOkxSandboxBalancesV0';
import { DaaRebalanceRunProgressV0 } from './DaaRebalanceRunProgressV0';
import { DaaDynamicRebalanceRunCompletionToastV0 } from './DaaDynamicRebalanceRunCompletionToastV0';
import { DaaOrderStatusTrackerV0 } from './DaaOrderStatusTrackerV0';
import DaaRebalancePanelAutoPlanSectionV0 from './DaaRebalancePanelAutoPlanSectionV0';
import DaaRebalancePanelWorkflowSectionsV0 from './DaaRebalancePanelWorkflowSectionsV0';
import DaaRebalancePreflightModalV0 from './DaaRebalancePreflightModalV0';
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
const LS_AUTO_PLAN_SCENARIO_PRESETS_V0 = 'daa.market.funds.autoPlan.presets.v0';
type AutoPlanScenarioPresetV0 = {
  id: string;
  name: string;
  updatedAt: string;
  inputA: string;
  inputB: string;
  thresholdPctOverrideA: number | null;
  thresholdPctOverrideB: number | null;
};
type LiveTimelineEntryV0 = {
  id: string;
  at: string;
  stage: string;
  detail: string;
  level: 'info' | 'ok' | 'error';
};
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
  const [autoPlanPresetsV0, setAutoPlanPresetsV0] = useState<AutoPlanScenarioPresetV0[]>(() => {
    const saved = readJsonFromLs<any>(LS_AUTO_PLAN_SCENARIO_PRESETS_V0);
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((x) => x && typeof x === 'object')
      .map((x: any) => ({
        id: String(x.id ?? ''),
        name: String(x.name ?? ''),
        updatedAt: String(x.updatedAt ?? ''),
        inputA: String(x.inputA ?? ''),
        inputB: String(x.inputB ?? ''),
        thresholdPctOverrideA:
          x.thresholdPctOverrideA === null || x.thresholdPctOverrideA === undefined
            ? null
            : Number.isFinite(Number(x.thresholdPctOverrideA))
              ? Number(x.thresholdPctOverrideA)
              : null,
        thresholdPctOverrideB:
          x.thresholdPctOverrideB === null || x.thresholdPctOverrideB === undefined
            ? null
            : Number.isFinite(Number(x.thresholdPctOverrideB))
              ? Number(x.thresholdPctOverrideB)
              : null,
      }))
      .filter((x) => x.id && x.name);
  });
  const [autoPlanPresetNameV0, setAutoPlanPresetNameV0] = useState('');
  const [autoPlanSelectedPresetIdV0, setAutoPlanSelectedPresetIdV0] = useState<string>('');
  const [driftFilter, setDriftFilter] = useState<'all' | 'over' | 'under'>('all');
  const [rev, setRev] = useState(0);
  const executionMode: ExecutionModeV0 = useMemo(() => loadExecutionModeV0(), [rev]);
  const executionModeNormalized: ExecutionModeV0 = executionMode === 'live' ? 'paper' : executionMode;
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
  const [liveTimelineV0, setLiveTimelineV0] = useState<LiveTimelineEntryV0[]>([]);
  const lastRunDaaStatusRef = useRef<typeof runDaaStatus>('idle');
  const lastPaperRunLoadingRef = useRef(false);
  const lastPaperRunRecordedAtRef = useRef<string | null>(null);
  const lastPaperRunErrorRef = useRef<string | null>(null);
  // Preflight checklist (v0): confirm key safety/inputs before running a paper rebalance.
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightPendingOpts, setPreflightPendingOpts] = useState<{ cashSweep?: boolean } | null>(null);
  const [preflightAckPrices, setPreflightAckPrices] = useState(false);
  const [preflightAckConstraints, setPreflightAckConstraints] = useState(false);
  const [preflightAckCash, setPreflightAckCash] = useState(false);
  const [preflightOverrideBlockers, setPreflightOverrideBlockers] = useState(false);
  const [detectionReviewStateV0, setDetectionReviewStateV0] = useState<Record<string, 'approved' | 'rejected'>>({});
  useEffect(() => {
    if (executionMode !== 'live') return;
    persistExecutionModeV0('paper');
    setRev((x) => x + 1);
  }, [executionMode]);
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
  function pushLiveTimelineV0(entry: Omit<LiveTimelineEntryV0, 'id' | 'at'>) {
    setLiveTimelineV0((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        at: new Date().toISOString(),
        ...entry,
      },
      ...prev,
    ].slice(0, 20));
  }
  useEffect(() => {
    if (runDaaStatus !== lastRunDaaStatusRef.current) {
      lastRunDaaStatusRef.current = runDaaStatus;
      if (runDaaStatus === 'running') pushLiveTimelineV0({ stage: 'Run DAA', detail: 'Step2 refresh + Step4 recommendation started.', level: 'info' });
      if (runDaaStatus === 'ok') pushLiveTimelineV0({ stage: 'Run DAA', detail: runDaaStatusText || 'Run DAA completed.', level: 'ok' });
      if (runDaaStatus === 'error') pushLiveTimelineV0({ stage: 'Run DAA', detail: runDaaStatusText || 'Run DAA failed.', level: 'error' });
    }
  }, [runDaaStatus, runDaaStatusText]);
  useEffect(() => {
    if (paperRunLoading !== lastPaperRunLoadingRef.current) {
      lastPaperRunLoadingRef.current = paperRunLoading;
      if (paperRunLoading) pushLiveTimelineV0({ stage: 'Preflight execution', detail: 'Paper run started.', level: 'info' });
      if (!paperRunLoading && !paperRunError && paperRunRecordedAt) pushLiveTimelineV0({ stage: 'Preflight execution', detail: 'Paper run finished and recorded.', level: 'ok' });
    }
  }, [paperRunLoading, paperRunError, paperRunRecordedAt]);
  useEffect(() => {
    if (paperRunRecordedAt && paperRunRecordedAt !== lastPaperRunRecordedAtRef.current) {
      lastPaperRunRecordedAtRef.current = paperRunRecordedAt;
      pushLiveTimelineV0({ stage: 'Execution log', detail: `Recorded at ${paperRunRecordedAt}.`, level: 'ok' });
    }
  }, [paperRunRecordedAt]);
  useEffect(() => {
    if (paperRunError && paperRunError !== lastPaperRunErrorRef.current) {
      lastPaperRunErrorRef.current = paperRunError;
      pushLiveTimelineV0({ stage: 'Preflight execution', detail: paperRunError, level: 'error' });
    }
  }, [paperRunError]);
  useEffect(() => {
    // Persist the latest drift input(s) so users can refresh and keep the plan editor state.
    saveJsonToLs(LS_AUTO_PLAN_INPUT, {
      schemaVersion: 2,
      active: autoPlanScenario,
      a: { text: autoPlanInputTextA, thresholdPctOverride: autoPlanThresholdOverridePctA },
      b: { text: autoPlanInputTextB, thresholdPctOverride: autoPlanThresholdOverridePctB }});
  }, [autoPlanScenario, autoPlanInputTextA, autoPlanInputTextB, autoPlanThresholdOverridePctA, autoPlanThresholdOverridePctB]);
  useEffect(() => {
    saveJsonToLs(LS_AUTO_PLAN_SCENARIO_PRESETS_V0, autoPlanPresetsV0);
  }, [autoPlanPresetsV0]);
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
  function saveAutoPlanScenarioPresetV0() {
    const name = autoPlanPresetNameV0.trim();
    if (!name) return;
    const id = `${Date.now()}`;
    const next: AutoPlanScenarioPresetV0 = {
      id,
      name,
      updatedAt: new Date().toISOString(),
      inputA: autoPlanInputTextA,
      inputB: autoPlanInputTextB,
      thresholdPctOverrideA: autoPlanThresholdOverridePctA,
      thresholdPctOverrideB: autoPlanThresholdOverridePctB,
    };
    setAutoPlanPresetsV0((prev) => [next, ...prev].slice(0, 20));
    setAutoPlanSelectedPresetIdV0(id);
    setAutoPlanPresetNameV0('');
  }
  function loadAutoPlanScenarioPresetV0(id: string) {
    const preset = autoPlanPresetsV0.find((x) => x.id === id);
    if (!preset) return;
    setAutoPlanInputTextA(preset.inputA);
    setAutoPlanInputTextB(preset.inputB);
    setAutoPlanThresholdOverridePctA(preset.thresholdPctOverrideA);
    setAutoPlanThresholdOverridePctB(preset.thresholdPctOverrideB);
    setAutoPlanScenario('A');
  }
  function deleteAutoPlanScenarioPresetV0(id: string) {
    setAutoPlanPresetsV0((prev) => prev.filter((x) => x.id !== id));
    if (autoPlanSelectedPresetIdV0 === id) setAutoPlanSelectedPresetIdV0('');
  }
  const baseCcy = useMemo(() => {
    const mp: any = moneyPlan as any;
    return typeof mp?.account?.baseCcy === 'string' ? String(mp.account.baseCcy) : null;
  }, [moneyPlan]);
  // smartDefaultsHintsV0 is defined after target/price data so dependencies are initialized.
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
  const smartDefaultsHintsV0 = useMemo(() => {
    const hints: string[] = [];
    if (!baseCcy) hints.push('Money plan base currency is missing (wizard Step3).');
    if (!targetWeights.length) hints.push('Target weights are empty (wizard Step4).');
    if (priceDataWarningsV0.missing.length > 0) hints.push(`Missing prices for ${priceDataWarningsV0.missing.length} symbol(s).`);
    if (priceDataWarningsV0.lastClose.length > 0) hints.push(`Using last-close fallback for ${priceDataWarningsV0.lastClose.length} symbol(s).`);
    return hints;
  }, [baseCcy, priceDataWarningsV0.lastClose.length, priceDataWarningsV0.missing.length, targetWeights.length]);
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
  const liquiditySettlementGateV0 = useMemo(() => {
    const estimatedBuys = effectiveOrders.filter((o) => o.side === 'BUY').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
    const estimatedSells = effectiveOrders.filter((o) => o.side === 'SELL').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
    const settlementLagDays = sellProceedsRoutingV0 === 'CASH' ? 0 : 2;
    return getLiquiditySettlementGateV0({
      settlementLagDays,
      estimatedBuys,
      estimatedSells,
      availableCash: portfolioCash,
      baseCcy,
    });
  }, [baseCcy, effectiveOrders, portfolioCash, sellProceedsRoutingV0]);
  const executionBlockReason = preTradeCashCheck.blocking
    ? preTradeCashCheck.message
    : liquiditySettlementGateV0.blocked
      ? liquiditySettlementGateV0.message
      : undefined;
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
  const targetedDecisionTransparencyV0 = useMemo(() => {
    const byCode = new Map<string, FundLike>();
    for (const f of funds ?? []) {
      const code = String(f?.code ?? '').trim();
      if (code) byCode.set(code, f);
    }
    return buildTargetedDecisionTransparencyV0({
      rebalanceTableRows,
      driftThresholdPct,
      cashBlocked: preTradeCashCheck.blocking,
      liquidityBlocked: liquiditySettlementGateV0.blocked,
      hasBlockingViolation: preRunViolationsV0.some((v) => String(v?.level ?? '') === 'blocker'),
      resolvePrice: (symbol) => resolveFundPriceV0({ symbol, snapshot: priceSnapshot, fund: byCode.get(symbol) }),
    });
  }, [driftThresholdPct, funds, liquiditySettlementGateV0.blocked, preRunViolationsV0, preTradeCashCheck.blocking, priceSnapshot, rebalanceTableRows]);
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
    const mode: ExecutionModeV0 = executionModeNormalized;
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
    if (liquiditySettlementGateV0.blocked) {
      setPaperRunError(liquiditySettlementGateV0.message);
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
            <DaaRebalancePreflightModalV0
        open={preflightOpen}
        pendingOpts={preflightPendingOpts}
        baseCcy={baseCcy}
        previewOrders={preflightPreviewOrders}
        previewWhatIf={preflightPreviewWhatIf}
        hasPriceWarnings={preflightHasPriceWarnings}
        priceWarnings={priceDataWarningsV0}
        hasBlocking={preRunHasBlockingV0}
        hasWarnings={preRunHasWarningsV0}
        violations={preRunViolationsV0}
        preTradeCashCheck={preTradeCashCheck}
        ackPrices={preflightAckPrices}
        ackConstraints={preflightAckConstraints}
        ackCash={preflightAckCash}
        overrideBlockers={preflightOverrideBlockers}
        canProceed={preflightCanProceed}
        loading={paperRunLoading}
        executionBlockReason={executionBlockReason}
        targetWeightsCount={targetWeights.length}
        onClose={closePreflight}
        onJump={closePreflightAndJump}
        onSetAckPrices={setPreflightAckPrices}
        onSetAckConstraints={setPreflightAckConstraints}
        onSetAckCash={setPreflightAckCash}
        onSetOverrideBlockers={setPreflightOverrideBlockers}
        onProceed={proceedFromPreflight}
      />
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
                      Execution: <b>dry run (paper)</b> — records to local execution log only.
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
                disabled={paperRunLoading || !!executionBlockReason || !targetWeights.length}
                title={executionBlockReason}
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
            onClick={() => {
              runDaaRefreshAndRecommendationV0();
              openPreflightForRun();
            }}
            style={{ padding: '6px 10px' }}
            disabled={runDaaStatus === 'running' || paperRunLoading || !targetWeights.length || !!executionBlockReason}
            title={executionBlockReason ?? 'Fast path: run DAA refresh/recommendation, then open preflight checklist.'}
          >
            {runDaaStatus === 'running' ? 'Preparing...' : 'Run + preflight'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => openPreflightForRun()}
            style={{ padding: '6px 10px' }}
            disabled={paperRunLoading || !targetWeights.length || !!executionBlockReason}
            title={executionBlockReason ?? 'Manual trigger: open preflight and run a paper rebalance now.'}
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
          <button
            type="button"
            className="button secondary"
            onClick={() => window.open('/daa/dashboard?tab=dashboard#history-audit', '_self')}
            style={{ padding: '6px 10px' }}
            title="Jump to dashboard history/audit for recent run inspection."
          >
            Open dashboard history
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
            disabled={paperRunLoading || !targetWeights.length || !!executionBlockReason}
            title={executionBlockReason ?? 'Manual trigger: open preflight and run a paper rebalance now.'}
          >
            {paperRunLoading ? 'Running...' : 'Manual run'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              runDaaRefreshAndRecommendationV0();
              openPreflightForRun();
            }}
            disabled={runDaaStatus === 'running' || paperRunLoading || !targetWeights.length || !!executionBlockReason}
            title={executionBlockReason ?? 'Fast path: run DAA refresh/recommendation, then open preflight checklist.'}
          >
            {runDaaStatus === 'running' ? 'Preparing...' : 'Run+checklist'}
          </button>
          <button type="button" className="button secondary" onClick={() => jumpTo(nextJump.targetId)}>
            {nextJump.buttonText}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => window.open('/daa/dashboard?tab=dashboard#history-audit', '_self')}
            title="Jump to dashboard history/audit for recent run inspection."
          >
            History
          </button>
        </div>
        <div className="daa-mobile-jumps-v0">
          {MARKET_FUNDS_QUICK_JUMPS_V0.map((item) => (
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
        const nextAction = missingTargets
          ? {
              label: 'Next action: Set target weights',
              button: 'Open target weights',
              onClick: () => jumpTo('target-weights')}
          : hasPriceWarnings
            ? {
                label: 'Next action: Resolve price warnings',
                button: 'Open prices',
                onClick: () => jumpTo('prices')}
            : cashBlocked
              ? {
                  label: 'Next action: Resolve cash blocker',
                  button: 'Review cash routing',
                  onClick: () => jumpTo('rebalance')}
              : blockers.length
                ? {
                    label: 'Next action: Resolve checklist blockers',
                    button: 'Review blockers',
                    onClick: () => jumpTo('rebalance')}
                : {
                    label: 'Next action: Review warnings then run preflight',
                    button: 'Open preflight checklist',
                    onClick: () => openPreflightForRun()};
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
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, border: `1px solid ${ui.border}`, background: 'rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{nextAction.label}</div>
              <div style={{ marginTop: 6 }}>
                <button type="button" className="button" onClick={nextAction.onClick} style={{ padding: '4px 8px' }}>
                  {nextAction.button}
                </button>
              </div>
            </div>
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
      {(() => {
        const checks = [
          { label: 'Target weights configured', ok: targetWeights.length > 0 },
          { label: 'Price inputs usable', ok: priceDataWarningsV0.missing.length === 0 },
          { label: 'Cash/settlement clear', ok: !preTradeCashCheck.blocking },
          { label: 'No checklist blockers', ok: preRunViolationsV0.filter((v) => v.level === 'blocker').length === 0 },
        ];
        const readyCount = checks.filter((c) => c.ok).length;
        const scorePct = Math.round((readyCount / checks.length) * 100);
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Step readiness scorecard</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Shows blockers before execution.</div>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              readiness score: <b style={{ color: scorePct >= 75 ? '#16a34a' : scorePct >= 50 ? '#f59e0b' : 'var(--danger)' }}>{scorePct}%</b> ({readyCount}/{checks.length})
            </div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {checks.map((c) => (
                <div key={c.label} style={{ fontSize: 11 }}>
                  {c.ok ? 'OK' : 'BLOCKED'} · {c.label}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const detections: Array<{ id: string; label: string; detail: string }> = [];
        if (!targetWeights.length) {
          detections.push({ id: 'missing-targets', label: 'Missing target weights', detail: 'Configure target weights before execution.' });
        }
        if (preTradeCashCheck.blocking) {
          detections.push({ id: 'cash-blocked', label: 'Cash/settlement blocker', detail: preTradeCashCheck.message });
        }
        if (priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0) {
          detections.push({
            id: 'price-warnings',
            label: 'Price data warnings',
            detail: `missing=${priceDataWarningsV0.missing.length}; lastCloseFallback=${priceDataWarningsV0.lastClose.length}`,
          });
        }
        for (const v of preRunViolationsV0.slice(0, 3)) {
          const detail = Array.isArray(v.details) ? v.details.join(' ') : '';
          detections.push({ id: `violation-${v.level}-${v.title}`, label: `${v.level.toUpperCase()}: ${v.title}`, detail });
        }
        if (!detections.length) return null;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Inline detection review workspace</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Quick approve/reject for detected issues before rerun.</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {detections.map((d) => {
                const state = detectionReviewStateV0[d.id] ?? null;
                return (
                  <div key={d.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{d.label}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{d.detail}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      <button
                        type="button"
                        className={state === 'approved' ? 'button' : 'button secondary'}
                        style={{ padding: '4px 8px' }}
                        onClick={() => setDetectionReviewStateV0((prev) => ({ ...prev, [d.id]: 'approved' }))}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={state === 'rejected' ? 'button' : 'button secondary'}
                        style={{ padding: '4px 8px' }}
                        onClick={() => setDetectionReviewStateV0((prev) => ({ ...prev, [d.id]: 'rejected' }))}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Funds hub smart defaults</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Apply operator-friendly defaults and see inline hints for missing inputs.</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <button
            type="button"
            className="button secondary"
            style={{ padding: '4px 8px' }}
            onClick={() => {
              persistExecutionModeV0('paper');
              persistSellProceedsRoutingV0('CASH');
              persistMaxTurnoverPct01V0(0.35);
              persistCashBucketTargetPct01V0(0.02);
              setWhatIfDriftThresholdPctV0(null);
              setRev((x) => x + 1);
            }}
          >
            Apply smart defaults
          </button>
          <button
            type="button"
            className="button secondary"
            style={{ padding: '4px 8px' }}
            onClick={() => jumpTo('rebalance')}
          >
            Open ready-to-run section
          </button>
        </div>
        {smartDefaultsHintsV0.length ? (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {smartDefaultsHintsV0.map((hint) => (
              <div key={hint} className="muted" style={{ fontSize: 11 }}>- {hint}</div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>All key inputs look complete. You can run preflight now.</div>
        )}
      </div>
      {(() => {
        const urgent = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).slice(0, 5);
        const medium = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= driftThresholdPct && Math.abs(r.deltaPct) < Math.max(driftThresholdPct * 1.5, 0.03)).slice(0, 5);
        const warningSymbols = Array.from(new Set([...(priceDataWarningsV0.missing ?? []), ...(priceDataWarningsV0.lastClose ?? [])])).slice(0, 6);
        if (!urgent.length && !medium.length && !warningSymbols.length) return null;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Watchlist signal inbox</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Grouped market signals by urgency and symbol.</div>
            {urgent.length ? (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <b style={{ color: 'var(--danger)' }}>Urgent</b>: {urgent.map((r) => `${r.id} ${(r.deltaPct * 100).toFixed(1)}%`).join(' · ')}
              </div>
            ) : null}
            {medium.length ? (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                <b style={{ color: '#f59e0b' }}>Medium</b>: {medium.map((r) => `${r.id} ${(r.deltaPct * 100).toFixed(1)}%`).join(' · ')}
              </div>
            ) : null}
            {warningSymbols.length ? (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                <b className="muted">Price warnings</b>: {warningSymbols.join(', ')}
              </div>
            ) : null}
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('prices')}>
                Review price inputs
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Review symbol targets
              </button>
            </div>
          </div>
        );
      })()}
      <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Operator shift handover</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Summary for next shift continuity.</div>
        <div style={{ marginTop: 6, fontSize: 11 }}>
          last run={paperRunRecordedAt ? paperRunRecordedAt : 'none'} · runStatus={paperRunError ? 'failed' : paperRunLoading ? 'running' : 'idle'}
          {' '}· blockers={preRunViolationsV0.filter((v) => v.level === 'blocker').length}
          {' '}· warnings={preRunViolationsV0.filter((v) => v.level === 'warning').length}
        </div>
        <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
          next shift focus: {paperRunError ? 'use incident playbook and recover run' : preTradeCashCheck.blocking ? 'resolve cash/settlement blocker' : 'review preflight and run dry rebalance'}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('history-audit')}>
            Open history/audit
          </button>
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
            Open preflight checklist
          </button>
        </div>
      </div>
      {(() => {
        const rows = rebalanceTableRows.slice(0, 40);
        if (!rows.length) return null;
        const bucket = {
          A: { value: 0, drift: 0 },
          H: { value: 0, drift: 0 },
          US: { value: 0, drift: 0 },
          Other: { value: 0, drift: 0 },
        };
        for (const r of rows) {
          const id = String(r.id ?? '').trim();
          const vRaw = Number((r as any).currentValue ?? Number.NaN);
          const v = Number.isFinite(vRaw) ? vRaw : 0;
          const d = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const key = /^\d{6}$/.test(id) ? 'A' : /^HK/i.test(id) || /^0\d{4}$/.test(id) ? 'H' : /^[A-Z]{1,5}$/.test(id) ? 'US' : 'Other';
          bucket[key as 'A' | 'H' | 'US' | 'Other'].value += v;
          bucket[key as 'A' | 'H' | 'US' | 'Other'].drift = Math.max(bucket[key as 'A' | 'H' | 'US' | 'Other'].drift, d);
        }
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Cross-market ledger risk view</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Unified base-ccy exposure for A/H/US books.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {(['A', 'H', 'US', 'Other'] as const).map((k) => (
                <div key={k} style={{ fontSize: 11 }}>
                  {k}: exposure≈<b>{bucket[k].value.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''} · max|drift|≈<b>{(bucket[k].drift * 100).toFixed(2)}%</b>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const blockerCount = preRunViolationsV0.filter((v) => v.level === 'blocker').length;
        const warningCount = preRunViolationsV0.filter((v) => v.level === 'warning').length;
        const missingPriceCount = priceDataWarningsV0.missing.length;
        const stalePriceCount = priceDataWarningsV0.lastClose.length;
        const driftHotCount = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).length;
        const analystPenalty = missingPriceCount * 8 + stalePriceCount * 5 + Math.min(20, driftHotCount * 2);
        const managerPenalty = blockerCount * 18 + warningCount * 5 + (preTradeCashCheck.blocking ? 12 : 0) + (paperRunError ? 15 : 0);
        const analystScore = Math.max(0, 100 - analystPenalty);
        const managerScore = Math.max(0, 100 - managerPenalty);
        const tierOf = (score: number) => (score >= 80 ? 'elite' : score >= 50 ? 'neutral' : 'incompetent');
        const tierColor = (tier: 'elite' | 'neutral' | 'incompetent' | string) => (tier === 'elite' ? '#16a34a' : tier === 'neutral' ? '#f59e0b' : 'var(--danger)');
        const analystTier = tierOf(analystScore);
        const managerTier = tierOf(managerScore);
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Human-factor scoreboard</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Analyst/manager grades with transparent score breakdown.</div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Analyst</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>score <b>{analystScore}</b> · tier <b style={{ color: tierColor(analystTier) }}>{analystTier}</b></div>
                <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                  100 - ({missingPriceCount} missing×8 + {stalePriceCount} stale×5 + hot drift cap {Math.min(20, driftHotCount * 2)})
                </div>
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Manager</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>score <b>{managerScore}</b> · tier <b style={{ color: tierColor(managerTier) }}>{managerTier}</b></div>
                <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                  100 - ({blockerCount} blockers×18 + {warningCount} warnings×5 + cash block {preTradeCashCheck.blocking ? 12 : 0} + run error {paperRunError ? 15 : 0})
                </div>
              </div>
            </div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {[{ role: 'Analyst', tier: analystTier, score: analystScore }, { role: 'Manager', tier: managerTier, score: managerScore }].map((r) => (
                <div key={r.role} style={{ fontSize: 11 }}>
                  {/* tier-ladder: elite >= 80, neutral 50-79, incompetent < 50 */}
                  {r.role} tier-ladder: elite {'>='} 80, neutral 50-79, incompetent {'<'} 50 · current=<b style={{ color: tierColor(r.tier) }}>{r.tier}</b> ({r.score})
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 40);
        if (!rows.length) return null;
        const netDeltaNotional = rows.reduce((sum, r) => {
          const vRaw = Number((r as any).deltaValue ?? Number.NaN);
          const v = Number.isFinite(vRaw) ? vRaw : 0;
          return sum + v;
        }, 0);
        const highDriftCount = rows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).length;
        const envStressScore = highDriftCount * 6 + priceDataWarningsV0.missing.length * 10 + priceDataWarningsV0.lastClose.length * 4;
        const analystThesis = netDeltaNotional >= 0 ? 'risk-on' : 'risk-off';
        const regime = envStressScore >= 40 ? 'risk-off' : 'risk-on';
        const diverged = analystThesis !== regime;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${diverged ? 'var(--danger)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, background: diverged ? 'rgba(220,38,38,0.08)' : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Analyst logic-consistency alerts</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Flag divergence between analyst thesis and environment regime.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              thesis=<b>{analystThesis}</b> · regime=<b>{regime}</b> · status=<b style={{ color: diverged ? 'var(--danger)' : '#16a34a' }}>{diverged ? 'diverged' : 'aligned'}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              regime score = high drift {highDriftCount}×6 + missing prices {priceDataWarningsV0.missing.length}×10 + stale closes {priceDataWarningsV0.lastClose.length}×4 = {envStressScore}
            </div>
            {diverged ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('prices')}>
                  Recheck market regime inputs
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Rebalance thesis vs target weights
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 12);
        if (!rows.length) return null;
        const highDriftThreshold = Math.max(driftThresholdPct * 1.5, 0.03);
        const drifted = rows.filter((r) => Math.abs(r.deltaPct) >= highDriftThreshold);
        const downWeightFactor = 0.85;
        if (!drifted.length) {
          return (
            <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(34,197,94,0.45)', borderRadius: 12, background: 'rgba(22,163,74,0.08)' }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Thesis-regime drift control</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>No drift alert triggered; controlled down-weighting not required.</div>
            </div>
          );
        }
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 12, background: 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Thesis-regime drift alerts + controlled down-weighting</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Alert drifted symbols and apply a controlled down-weight factor.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {drifted.map((r) => {
                const base = Number.isFinite(r.targetPct) ? r.targetPct : 0;
                const adjusted = Math.max(0, base * downWeightFactor);
                return (
                  <div key={String(r.id ?? '')} style={{ fontSize: 11 }}>
                    {/* W_base={(base * 100).toFixed(2)}% -> W_controlled={(adjusted * 100).toFixed(2)}% (factor {downWeightFactor.toFixed(2)}) */}
                    {String(r.id ?? '')}: drift={(r.deltaPct * 100).toFixed(1)}% · W_base={(base * 100).toFixed(2)}% {'->'} W_controlled={(adjusted * 100).toFixed(2)}% (factor {downWeightFactor.toFixed(2)})
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Apply controlled down-weighting
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Re-route drifted recommendations
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 8);
        if (!rows.length) return null;
        const missingSet = new Set(priceDataWarningsV0.missing.map((x) => String(x || '').trim()));
        const staleSet = new Set(priceDataWarningsV0.lastClose.map((x) => String(x || '').trim()));
        const qatRows = rows.map((r) => {
          const id = String(r.id ?? '').trim();
          const driftAbs = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const quality = Math.max(0.6, 1 - Math.min(0.35, driftAbs * 1.8) - (missingSet.has(id) ? 0.2 : 0) - (staleSet.has(id) ? 0.1 : 0));
          const wQat = Math.max(0, r.targetPct * quality);
          return { id, targetPct: r.targetPct, quality, wQat, driftAbs };
        });
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>QAT weight-adjusted targets (W_qat)</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Operator-visible factor trace for quality-adjusted target weights.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {/* => W_qat=<b>{(r.wQat * 100).toFixed(2)}%</b> */}
              {qatRows.map((r) => (
                <div key={r.id} style={{ fontSize: 11 }}>
                  {r.id}: W_target={(r.targetPct * 100).toFixed(2)}% × Q={r.quality.toFixed(2)} (|drift|={(r.driftAbs * 100).toFixed(1)}%, missing={missingSet.has(r.id) ? 'yes' : 'no'}, stale={staleSet.has(r.id) ? 'yes' : 'no'}) {'=>'} W_qat=<b>{(r.wQat * 100).toFixed(2)}%</b>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 20);
        if (!rows.length) return null;
        const highDriftThreshold = Math.max(driftThresholdPct * 1.5, 0.03);
        const highDriftCount = rows.filter((r) => Math.abs(r.deltaPct) >= highDriftThreshold).length;
        const deepNegativeCount = rows.filter((r) => r.deltaPct <= -highDriftThreshold).length;
        const stressScore = highDriftCount * 5 + priceDataWarningsV0.missing.length * 8 + priceDataWarningsV0.lastClose.length * 3;
        const scenario = stressScore >= 35 || deepNegativeCount >= 3 ? 'B' : 'A';
        const gateLabel = scenario === 'A' ? 'strong-hold gate' : 'value-trap gate';
        const routeLabel = scenario === 'A' ? 'route to normal rebalance execution' : 'route to defensive rebalance (trim/hedge first)';
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${scenario === 'A' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: scenario === 'A' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Rebalance scenario A/B gates</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Route execution by strong-hold vs value-trap decision gate.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              scenario <b>{scenario}</b> · gate <b>{gateLabel}</b> · decision <b>{routeLabel}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              stress score = high drift {highDriftCount}×5 + missing prices {priceDataWarningsV0.missing.length}×8 + stale closes {priceDataWarningsV0.lastClose.length}×3 = {stressScore}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Open scenario weight routing
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Apply gate in rebalance orders
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 24);
        if (!rows.length) return null;
        const isolatedRows = rows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.6, 0.04)).slice(0, 6);
        const lockedIds = new Set(isolatedRows.map((r) => String(r.id ?? '').trim()));
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Risk-tag MaxIn lock center</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Tag isolated assets and enforce physical MaxIn lock before increasing exposure.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {(isolatedRows.length ? isolatedRows : rows.slice(0, 3)).map((r) => {
                const id = String(r.id ?? '').trim();
                const lock = lockedIds.has(id) ? 'LOCKED_MAX_IN' : 'OPEN';
                const lockColor = lock === 'LOCKED_MAX_IN' ? 'var(--danger)' : '#16a34a';
                return (
                  <div key={id} style={{ fontSize: 11 }}>
                    {id}: tag=<b>{lockedIds.has(id) ? 'isolated' : 'normal'}</b> · maxInLock=<b style={{ color: lockColor }}>{lock}</b> · drift={(r.deltaPct * 100).toFixed(1)}%
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              rule: when tag=isolated and lock=LOCKED_MAX_IN, route buys to hold-only until operator unlocks physical limit.
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Review isolated tags
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Apply MaxIn lock routing
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 20);
        if (!rows.length) return null;
        const gate = liquiditySettlementGateV0.blocked || preTradeCashCheck.blocking ? 'blocked' : 'pass';
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${gate === 'pass' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: gate === 'pass' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Liquidity + settlement pre-trade gate</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Pre-trade liquidity and T+N settlement check with cash-gap forecast.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              gate=<b style={{ color: gate === 'pass' ? '#16a34a' : 'var(--danger)' }}>{gate}</b> · T+N=<b>{liquiditySettlementGateV0.settlementLagDays}</b> · cash gap forecast=<b>{liquiditySettlementGateV0.cashGap.toFixed(2)} {baseCcy || ''}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              buy={liquiditySettlementGateV0.estimatedBuys.toFixed(2)} · sell={liquiditySettlementGateV0.estimatedSells.toFixed(2)} · cash={liquiditySettlementGateV0.availableCash.toFixed(2)} · settled coverage={liquiditySettlementGateV0.settledLiquidityCoverage.toFixed(2)}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Open liquidity-sensitive orders
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
                Re-run T+N preflight
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const buyOrders = effectiveOrders.filter((o) => o.side === 'BUY');
        if (!buyOrders.length) return null;
        const availableCash = Number(portfolioCash || 0);
        const estimatedSells = effectiveOrders.filter((o) => o.side === 'SELL').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
        const liquidityCoverage = availableCash + estimatedSells;
        const liquidityCapPct = 0.3;
        const perOrderLiquidityCap = Math.max(0, liquidityCoverage * liquidityCapPct);
        const cappedOrders = buyOrders
          .map((o) => {
            const rawNotional = Math.max(0, Number(o.notional || 0));
            const cappedNotional = Math.min(rawNotional, perOrderLiquidityCap);
            return { ...o, rawNotional, cappedNotional, capped: cappedNotional < rawNotional };
          })
          .filter((o) => o.capped)
          .slice(0, 5);
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${cappedOrders.length ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)'}`, borderRadius: 12, background: cappedOrders.length ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Liquidity caps</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Clamp buy notionals to a fixed share of available liquidity before execution routing.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              liquidity cap per order=<b>{perOrderLiquidityCap.toFixed(2)} {baseCcy || ''}</b> ({(liquidityCapPct * 100).toFixed(0)}% of coverage) · capped orders=<b>{cappedOrders.length}</b>
            </div>
            {cappedOrders.length ? (
              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                {cappedOrders.map((o) => (
                  <div key={`${String(o.symbol)}-${String(o.side)}`} style={{ fontSize: 11 }}>
                    {String(o.symbol)}: BUY {o.rawNotional.toFixed(2)} {'->'} <b>{o.cappedNotional.toFixed(2)}</b> {baseCcy || ''}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 8);
        if (!rows.length) return null;
        const missingSet = new Set(priceDataWarningsV0.missing.map((x) => String(x || '').trim()));
        const staleSet = new Set(priceDataWarningsV0.lastClose.map((x) => String(x || '').trim()));
        const trace = rows.map((r) => {
          const id = String(r.id ?? '').trim();
          const driftAbs = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const hMultiplier = Math.max(0.75, 1 - Math.min(0.2, driftAbs * 1.2));
          const aiBias = missingSet.has(id) ? 0.85 : staleSet.has(id) ? 0.92 : 1.05;
          const quality = hMultiplier * aiBias;
          const wQat = Math.max(0, r.targetPct * quality);
          const action = wQat >= r.targetPct * 0.9 ? 'keep' : wQat >= r.targetPct * 0.75 ? 'trim' : 'defer';
          return { id, targetPct: r.targetPct, hMultiplier, aiBias, quality, wQat, action };
        });
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Usable W_qat decision flow</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Actionable step-by-step flow from W_target to W_qat to routing decision.</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Mainline W_qat formula task</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>W_qat = W_base * H_multiplier * AI_bias with visible per-symbol trace.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {/* target={(r.targetPct * 100).toFixed(2)}% -> Q={r.quality.toFixed(2)} -> W_qat={(r.wQat * 100).toFixed(2)}% -> action=<b>{r.action}</b> */}
              {/* W_base={(r.targetPct * 100).toFixed(2)}% * H_multiplier={r.hMultiplier.toFixed(2)} * AI_bias={r.aiBias.toFixed(2)} => W_qat={(r.wQat * 100).toFixed(2)}% -> action=<b>{r.action}</b> */}
              {trace.map((r) => (
                <div key={r.id} style={{ fontSize: 11 }}>
                  {r.id}: target={(r.targetPct * 100).toFixed(2)}% {'->'} Q={r.quality.toFixed(2)} {'->'} W_qat={(r.wQat * 100).toFixed(2)}% {'->'} action=<b>{r.action}</b>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Apply W_qat to target weights
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Open W_qat order routing
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const guardrailBlockers = preRunViolationsV0.filter((v) => v.level === 'blocker');
        const guardrailWarnings = preRunViolationsV0.filter((v) => v.level === 'warning');
        const canExecute = guardrailBlockers.length === 0 && !preTradeCashCheck.blocking;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${canExecute ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: canExecute ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Guardrail-first execution gate</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Execution is permitted only after guardrails pass; otherwise route to remediation first.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              status=<b style={{ color: canExecute ? '#16a34a' : 'var(--danger)' }}>{canExecute ? 'ready-to-execute' : 'blocked-by-guardrails'}</b> · blockers=<b>{guardrailBlockers.length}</b> · warnings=<b>{guardrailWarnings.length}</b>
            </div>
            {!canExecute ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
                  Resolve guardrails in preflight
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                  Hold execution and review orders
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 10);
        if (!rows.length) return null;
        const maxInPct = 0.04;
        const maxOutPct = 0.05;
        const breaches = rows
          .map((r) => {
            const drift = Number.isFinite(r.deltaPct) ? r.deltaPct : 0;
            const side = drift < 0 ? 'in' : 'out';
            const limit = side === 'in' ? maxInPct : maxOutPct;
            const breach = Math.abs(drift) > limit;
            return { id: String(r.id ?? ''), drift, side, limit, breach };
          })
          .filter((x) => x.breach)
          .slice(0, 6);
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${breaches.length ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)'}`, borderRadius: 12, background: breaches.length ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>MaxIn / MaxOut limits</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Clamp per-symbol move sizes before routing execution.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              MaxIn=<b>{(maxInPct * 100).toFixed(1)}%</b> · MaxOut=<b>{(maxOutPct * 100).toFixed(1)}%</b> · breaches=<b>{breaches.length}</b>
            </div>
            {breaches.length ? (
              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                {breaches.map((x) => (
                  <div key={x.id} style={{ fontSize: 11 }}>
                    {x.id}: drift={(x.drift * 100).toFixed(1)}% exceeds {x.side === 'in' ? 'MaxIn' : 'MaxOut'} {(x.limit * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const buyNotional = effectiveOrders.filter((o) => o.side === 'BUY').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
        const sellNotional = effectiveOrders.filter((o) => o.side === 'SELL').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
        const driftPressure = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct, 0.02)).length;
        const rebalanceAlpha = Math.max(0, sellNotional * 0.0006 - buyNotional * 0.0002);
        const humanFactorAlpha = Math.max(0, (100 - preRunViolationsV0.length * 8) * 0.8);
        const avoidedLoss = Math.max(0, driftPressure * 12 + (preTradeCashCheck.blocking ? 25 : 0));
        const total = rebalanceAlpha + humanFactorAlpha + avoidedLoss;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Monthly attribution evolution report</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Split monthly attribution into rebalance alpha, human-factor alpha, and avoided loss.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11 }}>rebalance alpha: <b>{rebalanceAlpha.toFixed(2)}</b> ({baseCcy || 'base'})</div>
              <div style={{ fontSize: 11 }}>human-factor alpha: <b>{humanFactorAlpha.toFixed(2)}</b> ({baseCcy || 'base'})</div>
              <div style={{ fontSize: 11 }}>avoided loss: <b>{avoidedLoss.toFixed(2)}</b> ({baseCcy || 'base'})</div>
              <div style={{ fontSize: 11 }}>total monthly attribution: <b>{total.toFixed(2)}</b> ({baseCcy || 'base'})</div>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trace: rebalance={sellNotional.toFixed(2)} sell vs {buyNotional.toFixed(2)} buy · human-factor score base={Math.max(0, 100 - preRunViolationsV0.length * 8)} · pressure={driftPressure}
            </div>
          </div>
        );
      })()}
      <DaaTargetedDecisionTransparencyCardV0 detail={targetedDecisionTransparencyV0} />
      {(() => {
        const recRows = rebalanceTableRows.slice(0, 10);
        if (!recRows.length) return null;
        const missingSet = new Set(priceDataWarningsV0.missing.map((x) => String(x || '').trim()));
        const staleSet = new Set(priceDataWarningsV0.lastClose.map((x) => String(x || '').trim()));
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Operator-visible factor trace by recommendation</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Every recommendation includes factor-level rationale before order routing.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {recRows.map((r) => {
                const id = String(r.id ?? '').trim();
                const driftAbs = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
                const hMultiplier = Math.max(0.75, 1 - Math.min(0.2, driftAbs * 1.2));
                const aiBias = missingSet.has(id) ? 0.85 : staleSet.has(id) ? 0.92 : 1.05;
                const wQat = Math.max(0, r.targetPct * hMultiplier * aiBias);
                const recommendation = wQat >= r.targetPct * 0.9 ? 'keep' : wQat >= r.targetPct * 0.75 ? 'trim' : 'defer';
                return (
                  <div key={id} style={{ fontSize: 11 }}>
                    {id}: rec=<b>{recommendation}</b> · factors(W_base={(r.targetPct * 100).toFixed(2)}%, H={hMultiplier.toFixed(2)}, AI={aiBias.toFixed(2)}, W_qat={(wQat * 100).toFixed(2)}%)
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {(() => {
        const blockerCount = preRunViolationsV0.filter((v) => v.level === 'blocker').length;
        const warningCount = preRunViolationsV0.filter((v) => v.level === 'warning').length;
        const logicDivergence = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).length;
        const humanFactorScore = Math.max(0, 100 - blockerCount * 18 - warningCount * 5);
        const logicConsistencyScore = Math.max(0, 100 - logicDivergence * 7 - priceDataWarningsV0.missing.length * 10);
        const loopStatus = humanFactorScore >= 70 && logicConsistencyScore >= 70 ? 'stable loop' : 'needs intervention';
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${loopStatus === 'stable loop' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: loopStatus === 'stable loop' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Human-factor + logic-consistency loop</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Evaluate analyst behavior and logic consistency in one closed feedback loop.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              human-factor=<b>{humanFactorScore}</b> · logic-consistency=<b>{logicConsistencyScore}</b> · loop=<b style={{ color: loopStatus === 'stable loop' ? '#16a34a' : 'var(--danger)' }}>{loopStatus}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trace: blockers {blockerCount}×18 + warnings {warningCount}×5 · divergence {logicDivergence}×7 + missing prices {priceDataWarningsV0.missing.length}×10
            </div>
            {loopStatus !== 'stable loop' ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Resolve thesis consistency
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
                  Re-run human-factor preflight
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const eliteSignals = [
          { name: 'Desk-A', defensive: preTradeCashCheck.blocking || priceDataWarningsV0.missing.length > 0 },
          { name: 'Desk-B', defensive: rebalanceTableRows.filter((r) => r.deltaPct <= -Math.max(driftThresholdPct, 0.02)).length >= 3 },
          { name: 'Desk-C', defensive: preRunViolationsV0.filter((v) => v.level === 'blocker').length > 0 || Boolean(paperRunError) },
        ];
        const defenseVotes = eliteSignals.filter((s) => s.defensive).length;
        const consensusDefense = defenseVotes >= 2;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${consensusDefense ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, background: consensusDefense ? 'rgba(220,38,38,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Black-swan consensus warning</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Warn when elite cohort consensus shifts from offense to defense.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              defense votes <b>{defenseVotes}/3</b> · consensus <b style={{ color: consensusDefense ? 'var(--danger)' : '#16a34a' }}>{consensusDefense ? 'defense shift detected' : 'stable risk posture'}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              cohort: {eliteSignals.map((s) => `${s.name}:${s.defensive ? 'defense' : 'offense'}`).join(' · ')}
            </div>
            {consensusDefense ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                  Switch to defensive routing
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('history-audit')}>
                  Review prior black-swan episodes
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 30);
        if (!rows.length) return null;
        const bucketKey = (id: string) => (/^\d{6}$/.test(id) ? 'CN-A' : /^HK/i.test(id) || /^0\d{4}$/.test(id) ? 'HK' : /^[A-Z]{1,5}$/.test(id) ? 'US' : 'OTHER');
        const bucketCounts = new Map<string, number>();
        for (const r of rows) {
          const key = bucketKey(String(r.id ?? '').trim());
          bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
        }
        const topShare = Math.max(...Array.from(bucketCounts.values(), (v) => v / rows.length));
        const concentrationRisk = topShare >= 0.55 || bucketCounts.size <= 2;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${concentrationRisk ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, background: concentrationRisk ? 'rgba(220,38,38,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Analyst correlation-diversity check</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Prevent hidden concentration by checking cross-bucket style diversity.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              buckets=<b>{bucketCounts.size}</b> · top correlation bucket share=<b>{(topShare * 100).toFixed(1)}%</b> · status=<b style={{ color: concentrationRisk ? 'var(--danger)' : '#16a34a' }}>{concentrationRisk ? 'hidden concentration risk' : 'diversity acceptable'}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trace: {Array.from(bucketCounts.entries()).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </div>
            {concentrationRisk ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Rebalance concentration buckets
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                  Stage de-correlation orders
                </button>
              </div>
            ) : null}
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
        {liveTimelineV0.length ? (
          <details style={{ marginTop: 8 }} open>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Live execution timeline</summary>
            <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
              {liveTimelineV0.map((e) => (
                <div key={e.id} style={{ fontSize: 11, borderLeft: `2px solid ${e.level === 'error' ? 'var(--danger)' : e.level === 'ok' ? '#16a34a' : 'rgba(127,127,127,0.6)'}`, paddingLeft: 8 }}>
                  <span className="muted" style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{e.at}</span>
                  {' '}· <b>{e.stage}</b> · <span style={{ color: e.level === 'error' ? 'var(--danger)' : 'inherit' }}>{e.detail}</span>
                </div>
              ))}
            </div>
          </details>
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
                    value={executionModeNormalized}
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
                    AI recommender-only: no auto trade execution. Dry run only records orders to local execution log.
                  </span>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openPreflightForRun()}
                  style={{ padding: '6px 10px' }}
                  disabled={paperRunLoading || !targetWeights.length || !!executionBlockReason}
                  title={executionBlockReason}
                >
                  {paperRunLoading ? 'Running...' : 'Run rebalance (dry run)'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openPreflightForRun({ cashSweep: true })}
                  style={{ padding: '6px 10px' }}
                  disabled={paperRunLoading || !targetWeights.length || !!executionBlockReason}
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
                <details style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.1)' }} open>
                  <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Incident playbook (failed run)</summary>
                  <div style={{ marginTop: 6, display: 'grid', gap: 6, fontSize: 11 }}>
                    <div><b>1) Capture state:</b> copy diagnostics, then annotate run with incident tag/notes.</div>
                    <div><b>2) Contain risk:</b> review blockers + cash routing before any retry.</div>
                    <div><b>3) Recover:</b> open guided recovery, re-run preflight, then retry once constraints are clear.</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('history-audit')}>
                        Open history/audit
                      </button>
                      <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})}>
                        Run guided recovery
                      </button>
                    </div>
                  </div>
                </details>
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
            <details style={{ marginTop: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, background: 'rgba(0,0,0,0.1)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Run debugger</summary>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <div className="muted" style={{ fontSize: 11 }}>
                  One-click diagnostics + guided recovery actions for the current run state.
                </div>
                <div style={{ fontSize: 11 }}>
                  <b>Status</b>: {paperRunLoading ? 'running' : paperRunError ? 'error' : paperRunRecordedAt ? 'recorded' : 'idle'}
                  {' '}· <b>Targets</b>: {targetWeights.length ? 'ready' : 'missing'}
                  {' '}· <b>Cash</b>: {preTradeCashCheck.blocking ? 'blocked' : 'ok'}
                  {' '}· <b>Blockers</b>: {preRunViolationsV0.filter((v) => v.level === 'blocker').length}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={() => jumpTo('target-weights')}
                  >
                    Fix targets
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={() => jumpTo('prices')}
                  >
                    Refresh prices
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})}
                    disabled={paperRunLoading}
                  >
                    Open guided recovery
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ padding: '4px 8px' }}
                    onClick={() => {
                      const debug = {
                        at: new Date().toISOString(),
                        paperRunLoading,
                        paperRunError,
                        paperRunFailureDetails,
                        preTradeCashCheck,
                        blockers: preRunViolationsV0.filter((v) => v.level === 'blocker').map((v) => v.title),
                      };
                      void copyTextToClipboard(pretty(debug)).catch(() => {
                        // ignore
                      });
                    }}
                  >
                    Copy diagnostics
                  </button>
                </div>
              </div>
            </details>
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
                {paperRunDriftAlert.breached ? (
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <span className="muted" style={{ fontSize: 11 }}>Threshold-based action suggestions:</span>
                    <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
                      Open preflight checklist
                    </button>
                    <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                      Review target weights
                    </button>
                    <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('policy')}>
                      Tighten/relax threshold
                    </button>
                  </div>
                ) : (
                  <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
                    Drift is within threshold. Suggested action: keep monitoring or lower threshold for tighter control.
                  </div>
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
                {(() => {
                  const rows = rebalanceTableRows;
                  const overCount = rows.filter((r) => r.deltaPct >= driftThresholdPct).length;
                  const underCount = rows.filter((r) => r.deltaPct <= -driftThresholdPct).length;
                  const maxAbsDriftPct = rows.length ? Math.max(...rows.map((r) => Math.abs(r.deltaPct))) * 100 : 0;
                  const turnoverPct = whatIf && Number.isFinite(whatIf.turnoverPctOfTotalBefore) ? whatIf.turnoverPctOfTotalBefore * 100 : null;
                  const feeBps = Number.isFinite(whatIfFeeBps) ? whatIfFeeBps : 0;
                  const slippageBps = Number.isFinite(whatIfSlippageBpsUsed) ? whatIfSlippageBpsUsed : 0;
                  const riskLevel = maxAbsDriftPct >= 5 || (turnoverPct !== null && turnoverPct >= 35) ? 'High' : maxAbsDriftPct >= 2 || (turnoverPct !== null && turnoverPct >= 15) ? 'Medium' : 'Low';
                  return (
                    <div style={{ marginBottom: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, background: 'rgba(0,0,0,0.1)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>Policy impact simulator</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Preview allocation + risk posture before confirm (drift threshold / fees / slippage).</div>
                      <div style={{ marginTop: 5, fontSize: 11 }}>
                        drift over=<b>{overCount}</b>, under=<b>{underCount}</b>, maxAbs≈<b>{maxAbsDriftPct.toFixed(2)}%</b>
                        {' '}· turnover≈<b>{turnoverPct !== null ? `${turnoverPct.toFixed(2)}%` : 'n/a'}</b>
                        {' '}· fee/slippage=<b>{feeBps.toFixed(1)} / {slippageBps.toFixed(1)} bps</b>
                        {' '}· risk=<b style={{ color: riskLevel === 'High' ? 'var(--danger)' : riskLevel === 'Medium' ? '#f59e0b' : '#16a34a' }}>{riskLevel}</b>
                      </div>
                    </div>
                  );
                })()}
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
                        <div style={{ fontWeight: 700, fontSize: 12 }}>Execution cost preview</div>
                        {(() => {
                          const ccy = baseCcy ? ` ${baseCcy}` : '';
                          const baseCost = Number.isFinite(whatIf.costTotal) ? whatIf.costTotal : 0;
                          const low = baseCost * 0.8;
                          const high = baseCost * 1.25;
                          const feeBase = Number.isFinite(whatIf.feeTotal) ? whatIf.feeTotal : 0;
                          const slipBase = Number.isFinite(whatIf.slippageTotal) ? whatIf.slippageTotal : 0;
                          return (
                            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                              Estimated fee range≈<b>{(feeBase * 0.85).toFixed(2)}</b>~<b>{(feeBase * 1.15).toFixed(2)}</b>{ccy}
                              {' '}· slippage range≈<b>{(slipBase * 0.75).toFixed(2)}</b>~<b>{(slipBase * 1.35).toFixed(2)}</b>{ccy}
                              {' '}· total execution cost≈<b>{low.toFixed(2)}</b>~<b>{high.toFixed(2)}</b>{ccy}
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
                        <div style={{ fontWeight: 700, fontSize: 12 }}>What-if lab (side-by-side scenarios)</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                          Compare baseline vs stress assumptions before confirm.
                        </div>
                        {(() => {
                          const turnover = Number.isFinite(whatIf.turnoverPctOfTotalBefore) ? whatIf.turnoverPctOfTotalBefore * 100 : 0;
                          const maxAbs = whatIfRows.reduce((m, r) => Math.max(m, Math.abs(Number(r.driftPct ?? 0))), 0) * 100;
                          const baselineCostBps = (Number.isFinite(whatIfFeeBps) ? whatIfFeeBps : 0) + (Number.isFinite(whatIfSlippageBpsUsed) ? whatIfSlippageBpsUsed : 0);
                          const stressCostBps = baselineCostBps * 1.5;
                          return (
                            <div style={{ marginTop: 8, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                              <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>Scenario A · baseline</div>
                                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                                  turnover≈<b>{turnover.toFixed(2)}%</b> · max|drift|≈<b>{maxAbs.toFixed(2)}%</b> · cost≈<b>{baselineCostBps.toFixed(1)} bps</b>
                                </div>
                              </div>
                              <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>Scenario B · stress</div>
                                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                                  turnover≈<b>{(turnover * 1.2).toFixed(2)}%</b> · max|drift|≈<b>{(maxAbs * 1.15).toFixed(2)}%</b> · cost≈<b>{stressCostBps.toFixed(1)} bps</b>
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
          <DaaRebalancePanelAutoPlanSectionV0
            autoPlanScenario={autoPlanScenario}
            setAutoPlanScenario={setAutoPlanScenario}
            autoPlanPresetNameV0={autoPlanPresetNameV0}
            setAutoPlanPresetNameV0={setAutoPlanPresetNameV0}
            saveAutoPlanScenarioPresetV0={saveAutoPlanScenarioPresetV0}
            autoPlanSelectedPresetIdV0={autoPlanSelectedPresetIdV0}
            setAutoPlanSelectedPresetIdV0={setAutoPlanSelectedPresetIdV0}
            autoPlanPresetsV0={autoPlanPresetsV0}
            loadAutoPlanScenarioPresetV0={loadAutoPlanScenarioPresetV0}
            deleteAutoPlanScenarioPresetV0={deleteAutoPlanScenarioPresetV0}
            seedAutoPlanFromCurrentSnapshotV0={seedAutoPlanFromCurrentSnapshotV0}
            runAutoPlanV0={runAutoPlanV0}
            doCopyAutoPlanV0={doCopyAutoPlanV0}
            autoPlanResult={autoPlanResult}
            autoPlanCopyStatus={autoPlanCopyStatus}
            autoPlanThresholdOverridePct={autoPlanThresholdOverridePct}
            driftThresholdPct={driftThresholdPct}
            setAutoPlanThresholdOverridePctForActive={setAutoPlanThresholdOverridePctForActive}
            autoPlanThresholdPctUsed={autoPlanThresholdPctUsed}
            autoPlanInputText={autoPlanInputText}
            setAutoPlanInputTextForActive={setAutoPlanInputTextForActive}
            autoPlanError={autoPlanError}
            autoPlanResultA={autoPlanResultA}
            autoPlanResultB={autoPlanResultB}
            baseCcy={baseCcy}
            formatWeightsDiffLines={formatWeightsDiffLines}
            rebalanceMinTradeNotional={rebalancePolicy.minTradeNotional}
            whatIfFeeBps={whatIfFeeBps}
          />
          <DaaRebalancePanelWorkflowSectionsV0
            rev={rev}
            hasRecommendation={rt.hasRecommendation}
            onJump={(id) => {
              scrollToId(id);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
