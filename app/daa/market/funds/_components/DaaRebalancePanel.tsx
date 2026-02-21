'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LS_AUTO_PLAN_INPUT,
  LS_AUTO_PLAN_RESULT,
  LS_AUTO_PLAN_RESULT_A,
  LS_AUTO_PLAN_RESULT_B,
  LS_AUTO_PLAN_SCENARIO_PRESETS_V0,
  LS_REBALANCE_ASSET_BLACKLIST_V0,
  LS_WHATIF_DRIFT_THRESHOLD_PCT_V0,
  LS_WHATIF_FEE_BPS,
  LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0,
  LS_WHATIF_SLIPPAGE_BPS,
  LS_WHATIF_SLIPPAGE_SENSITIVITY_V0,
  SLIPPAGE_SENSITIVITY_MULTIPLIER_V0,
  type AutoPlanScenarioKeyV0,
  type AutoPlanScenarioPresetV0,
  type OrdersPreviewSourceV0,
  type SlippageSensitivityV0,
  useLocalStorageFiniteNumberV0,
  useLocalStorageOptionalNumberV0,
  useLocalStorageStringV0,
} from './DaaRebalancePanel.storageV0';
import { copyTextToClipboard } from '../../../copyToClipboard';
import { pushDynamicRebalanceNotificationV0 } from '../../../dynamicRebalanceNotificationsClientV0';
import { loadPortfolioStateV1, recordPortfolioLastRebalance } from '../../../portfolioStateStore';
import { loadPriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadTargetWeightsV1 } from '../../../targetWeightsStore';
import { loadRebalancePolicyV1 } from '../../../rebalancePolicyStore';
import { loadRebalanceScheduleStateV1, persistRebalanceScheduleV1 } from '../../../rebalanceScheduleStore';
import { loadExecutionModeV0, persistExecutionModeV0, type ExecutionModeV0 } from '../../../executionModeStore';
import { loadSellProceedsRoutingV0, persistSellProceedsRoutingV0 } from '../../../sellProceedsRoutingStoreV0';
import { loadCashBucketTargetPct01V0, persistCashBucketTargetPct01V0 } from '../../../cashBucketTargetStoreV0';
import { loadMaxTurnoverPct01V0, persistMaxTurnoverPct01V0 } from '../../../dynamicRebalanceGuardrailsStoreV0';
import { type SellProceedsRoutingV0 } from '@/src/daa/sellProceedsRoutingV0';
import { deriveInvestablePct01V0, scaleTargetWeightsByInvestablePct01V0 } from '@/src/daa/cashBucketTargetsV0';
import { OrdersReviewV0 } from '../../../_components/OrdersReviewV0';
import { simulateRebalanceWhatIfV0 } from '@/src/core/rebalanceWhatIf';
import { rebalanceCore, type RebalanceCoreRequest, type RebalanceCoreResponse } from '@/src/core/rebalanceCore';
import { backtestDriftRebalance, type DriftRebalanceBacktestResult } from '@/src/core/backtestDriftRebalance';
import { buildAutoPlanMarkdownV0 } from '@/src/core/autoPlanMarkdownV0';
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
import { estimateTaxLotsImpactV0 } from '@/src/daa/taxLotsImpactV0';
import {
  computeDriftAlertFromCoreResponse,
  computeDriftAlertFromTableRows,
  downloadTextAsFile,
  fmtPct01,
  formatOrdersMarkdown,
  formatWeightsDiffLines,
  formatWeightsMarkdown,
  normalizeOrders,
  normalizePlanSymbol,
  normalizeTargetWeights,
  normalizeTargetWeightsAny,
  pickFundNav,
  resolveFundPriceV0,
  safeJsonParse,
  scrollToId,
  toFiniteNumber,
  tryBuildSeriesBySymbolForPlan,
  type DriftAlertV0,
  type PaperRunHealthcheckV0,
  type SuggestedOrder,
  type TargetWeight,
} from './DaaRebalancePanel.helpersV0';
import { buildTargetedDecisionTransparencyV0 } from '@/src/daa/targetedDecisionTransparencyV0';
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
import DaaPortfolioEditorV0 from './DaaPortfolioEditorV0';
import DaaPriceSnapshotInputV0 from './DaaPriceSnapshotInputV0';
import DaaTargetWeightsEditorV0 from './DaaTargetWeightsEditorV0';
import DaaRebalancePolicyEditorV0 from './DaaRebalancePolicyEditorV0';
import DaaRebalanceScheduleV0 from './DaaRebalanceScheduleV0';
import DaaDynamicRebalancePausedReasonBannerV0 from './DaaDynamicRebalancePausedReasonBannerV0';
import DaaDynamicRebalanceLastOutcomeBannerV0 from './DaaDynamicRebalanceLastOutcomeBannerV0';
import DaaDynamicRebalanceSkipHistoryV0 from './DaaDynamicRebalanceSkipHistoryV0';
import DaaDynamicRebalanceNotificationWatcherV0 from './DaaDynamicRebalanceNotificationWatcherV0';
import DaaDynamicRebalanceNotificationsV0 from './DaaDynamicRebalanceNotificationsV0';
import DaaTargetedDecisionTransparencyCardV0 from './DaaTargetedDecisionTransparencyCardV0';
import DaaRebalanceOpsOverviewCardsV0 from './DaaRebalanceOpsOverviewCardsV0';
import DaaOkxSandboxBalancesV0 from './DaaOkxSandboxBalancesV0';
import { DaaRebalanceRunProgressV0 } from './DaaRebalanceRunProgressV0';
import { DaaDynamicRebalanceRunCompletionToastV0 } from './DaaDynamicRebalanceRunCompletionToastV0';
import { DaaOrderStatusTrackerV0 } from './DaaOrderStatusTrackerV0';
import DaaRebalancePanelAutoPlanSectionV0 from './DaaRebalancePanelAutoPlanSectionV0';
import DaaRebalancePanelWorkflowSectionsV0 from './DaaRebalancePanelWorkflowSectionsV0';
import DaaRebalancePreflightModalV0 from './DaaRebalancePreflightModalV0';
import DaaRebalanceWhatIfSectionV0 from './DaaRebalanceWhatIfSectionV0';
import DaaRebalanceRunOutcomePanelV0 from './DaaRebalanceRunOutcomePanelV0';
import DaaRebalancePanelHeaderActionsV0 from './DaaRebalancePanelHeaderActionsV0';
import DaaSafetyStopModalV0 from './DaaSafetyStopModalV0';
import DaaRebalancePanelMaintainabilityCardsV0 from './DaaRebalancePanelMaintainabilityCardsV0';
import DaaRebalancePanelDecisionCardsV0 from './DaaRebalancePanelDecisionCardsV0';
import {
  applySampleScenarioV0 as applySampleScenarioWorkflowV0,
  jumpToV0,
  runDaaRefreshAndRecommendationV0 as runDaaRefreshAndRecommendationWorkflowV0,
} from './DaaRebalancePanel.workflowHelpersV0';
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
type LiveTimelineEntryV0 = {
  id: string;
  at: string;
  stage: string;
  detail: string;
  level: 'info' | 'ok' | 'error';
};

function readAutoPlanInputV0() {
  const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
  return saved && typeof saved === 'object' ? saved : null;
}
function readAutoPlanThresholdOverrideV0(v: unknown): number | null {
  const n = v === null || v === undefined ? Number.NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function readAutoPlanPresetsV0(): AutoPlanScenarioPresetV0[] {
  const saved = readJsonFromLs<any>(LS_AUTO_PLAN_SCENARIO_PRESETS_V0);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((x) => x && typeof x === 'object')
    .map((x: any) => ({ id: String(x.id ?? ''), name: String(x.name ?? ''), updatedAt: String(x.updatedAt ?? ''), inputA: String(x.inputA ?? ''), inputB: String(x.inputB ?? ''), thresholdPctOverrideA: readAutoPlanThresholdOverrideV0(x.thresholdPctOverrideA), thresholdPctOverrideB: readAutoPlanThresholdOverrideV0(x.thresholdPctOverrideB) }))
    .filter((x) => x.id && x.name);
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
    const saved = readAutoPlanInputV0();
    return String(saved?.active ?? '') === 'B' ? 'B' : 'A';
  });
  const [autoPlanInputTextA, setAutoPlanInputTextA] = useState(() => {
    const saved = readAutoPlanInputV0();
    if (!saved) return '';
    const scenarioA = saved.a;
    if (scenarioA && typeof scenarioA === 'object' && typeof (scenarioA as any).text === 'string') return String((scenarioA as any).text);
    if (typeof (saved as any).text === 'string') return String((saved as any).text); // legacy
    return '';
  });
  const [autoPlanInputTextB, setAutoPlanInputTextB] = useState(() => {
    const saved = readAutoPlanInputV0();
    const scenarioB = saved?.b;
    return scenarioB && typeof scenarioB === 'object' && typeof (scenarioB as any).text === 'string' ? String((scenarioB as any).text) : '';
  });
  const [autoPlanThresholdOverridePctA, setAutoPlanThresholdOverridePctA] = useState<number | null>(() =>
    readAutoPlanThresholdOverrideV0(readAutoPlanInputV0()?.a?.thresholdPctOverride));
  const [autoPlanThresholdOverridePctB, setAutoPlanThresholdOverridePctB] = useState<number | null>(() =>
    readAutoPlanThresholdOverrideV0(readAutoPlanInputV0()?.b?.thresholdPctOverride));
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
  const [autoPlanPresetsV0, setAutoPlanPresetsV0] = useState<AutoPlanScenarioPresetV0[]>(readAutoPlanPresetsV0);
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
  const [whatIfDriftThresholdPctV0, setWhatIfDriftThresholdPctV0] = useLocalStorageOptionalNumberV0(LS_WHATIF_DRIFT_THRESHOLD_PCT_V0);
  // Use the same threshold for trigger policy, drift badges, and quick filters.
  // Users can override it in-place via the funds hub what-if slider.
  const driftThresholdPct = useMemo(() => {
    return whatIfDriftThresholdPctV0 !== null ? whatIfDriftThresholdPctV0 : policyDriftThresholdPct;
  }, [policyDriftThresholdPct, whatIfDriftThresholdPctV0]);
  const [assetBlacklistTextV0, setAssetBlacklistTextV0] = useLocalStorageStringV0(LS_REBALANCE_ASSET_BLACKLIST_V0, '');
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
  const autoPlanActiveState =
    autoPlanScenario === 'A'
      ? {
          inputText: autoPlanInputTextA,
          thresholdOverridePct: autoPlanThresholdOverridePctA,
          result: autoPlanResultA,
          error: autoPlanErrorA,
          setInputText: setAutoPlanInputTextA,
          setThresholdOverridePct: setAutoPlanThresholdOverridePctA,
          setError: setAutoPlanErrorA,
          setResult: setAutoPlanResultA,
        }
      : {
          inputText: autoPlanInputTextB,
          thresholdOverridePct: autoPlanThresholdOverridePctB,
          result: autoPlanResultB,
          error: autoPlanErrorB,
          setInputText: setAutoPlanInputTextB,
          setThresholdOverridePct: setAutoPlanThresholdOverridePctB,
          setError: setAutoPlanErrorB,
          setResult: setAutoPlanResultB,
        };
  const autoPlanInputText = autoPlanActiveState.inputText;
  const autoPlanThresholdOverridePct = autoPlanActiveState.thresholdOverridePct;
  const autoPlanThresholdPctUsed = autoPlanThresholdOverridePct !== null ? autoPlanThresholdOverridePct : driftThresholdPct;
  const autoPlanResult = autoPlanActiveState.result;
  const autoPlanError = autoPlanActiveState.error;
  const setAutoPlanInputTextForActive = autoPlanActiveState.setInputText;
  const setAutoPlanThresholdOverridePctForActive = autoPlanActiveState.setThresholdOverridePct;
  const setAutoPlanErrorForActive = autoPlanActiveState.setError;
  const setAutoPlanResultForActive = autoPlanActiveState.setResult;
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
  async function applySampleScenarioV0Handler() {
    await applySampleScenarioWorkflowV0({ setSampleStatus, setOpen });
  }
  const nextJump = useMemo(() => {
    if (rt.nextStepId === null) return { targetId: 'export', buttonText: '下一步：去导出' };
    return { targetId: `step${rt.nextStepId}`, buttonText: `下一步：去 Step${rt.nextStepId}` };
  }, [rt.nextStepId]);
  function jumpTo(targetId: string) {
    jumpToV0(setOpen, targetId);
  }
  async function runDaaRefreshAndRecommendationV0Handler() {
    await runDaaRefreshAndRecommendationWorkflowV0({
      runDaaStatus,
      setOpen,
      setRunDaaStatus,
      setRunDaaStatusText,
      jumpTo,
    });
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
  const [ordersPreviewSourceRawV0, setOrdersPreviewSourceRawV0] = useLocalStorageStringV0(LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0, 'RECOMPUTE');
  const ordersPreviewSourceV0: OrdersPreviewSourceV0 = ordersPreviewSourceRawV0 === 'ENGINE_LAST_RUN' ? 'ENGINE_LAST_RUN' : 'RECOMPUTE';
  function setOrdersPreviewSourceV0(value: OrdersPreviewSourceV0) {
    setOrdersPreviewSourceRawV0(value);
  }
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
  const [whatIfFeeBps, setWhatIfFeeBpsRaw] = useLocalStorageFiniteNumberV0(LS_WHATIF_FEE_BPS, 0);
  const [whatIfSlippageBps, setWhatIfSlippageBpsRaw] = useLocalStorageFiniteNumberV0(LS_WHATIF_SLIPPAGE_BPS, 0);
  function setWhatIfFeeBps(next: number) {
    setWhatIfFeeBpsRaw(String(next));
  }
  function setWhatIfSlippageBps(next: number) {
    setWhatIfSlippageBpsRaw(String(next));
  }
  const [whatIfSlippageSensitivityRawV0, setWhatIfSlippageSensitivityRawV0] = useLocalStorageStringV0(LS_WHATIF_SLIPPAGE_SENSITIVITY_V0, 'BASE');
  const whatIfSlippageSensitivityV0: SlippageSensitivityV0 =
    whatIfSlippageSensitivityRawV0 === 'LOW' || whatIfSlippageSensitivityRawV0 === 'HIGH' ? whatIfSlippageSensitivityRawV0 : 'BASE';
  function setWhatIfSlippageSensitivityV0(next: SlippageSensitivityV0) {
    setWhatIfSlippageSensitivityRawV0(next);
  }
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
            <DaaSafetyStopModalV0
        open={safetyStopOpen}
        pendingCashSweep={!!safetyStopPendingOpts?.cashSweep}
        copyApprovalSummaryStatus={copyApprovalSummaryStatus}
        previewOrders={safetyStopPreviewOrders}
        previewWhatIf={safetyStopPreviewWhatIf}
        baseCcy={baseCcy}
        whatIfFeeBps={whatIfFeeBps}
        whatIfSlippageBps={whatIfSlippageBps}
        whatIfSlippageBpsUsed={whatIfSlippageBpsUsed}
        whatIfSlippageSensitivity={whatIfSlippageSensitivityV0}
        preRunViolations={preRunViolationsV0}
        preTradeCashBlocking={preTradeCashCheck.blocking}
        preflightOverrideBlockers={preflightOverrideBlockers}
        portfolioCash={toFiniteNumber(portfolioCash) ?? 0}
        minTradeNotional={rebalancePolicy.minTradeNotional}
        paperRunLoading={paperRunLoading}
        executionBlockReason={executionBlockReason}
        targetWeightsCount={targetWeights.length}
        onCopyApprovalSummary={doCopyApprovalSummaryV0}
        onClose={closeSafetyStop}
        onSafetyStopDisableSchedule={safetyStopDisableDynamicScheduleV0}
        onProceed={proceedFromSafetyStop}
      />
      <DaaRebalancePanelHeaderActionsV0
        driftOverviewV0={driftOverviewV0}
        rev={rev}
        jumpTo={jumpTo}
        runDaaRefreshAndRecommendationV0={runDaaRefreshAndRecommendationV0Handler}
        runDaaStatus={runDaaStatus}
        openPreflightForRun={openPreflightForRun}
        paperRunLoading={paperRunLoading}
        targetWeightsLength={targetWeights.length}
        executionBlockReason={executionBlockReason}
        nextJump={nextJump}
        applySampleScenarioV0={applySampleScenarioV0Handler}
        sampleStatus={sampleStatus}
        doCopyBundle={doCopyBundle}
        copyStatus={copyStatus}
        open={open}
        setOpen={setOpen}
        onCancelRun={() => paperRunAbortRef.current?.abort()}
      />
      <DaaDynamicRebalanceNotificationWatcherV0 rev={rev} />
      <DaaDynamicRebalancePausedReasonBannerV0 rev={rev} />
      <DaaDynamicRebalanceLastOutcomeBannerV0 rev={rev} />
      <DaaDynamicRebalanceSkipHistoryV0 rev={rev} />
      <DaaRebalanceOpsOverviewCardsV0
        driftThresholdPct={driftThresholdPct}
        scheduleEnabled={!!loadRebalanceScheduleStateV1().schedule.enabled}
        targetWeightsLength={targetWeights.length}
        priceDataWarnings={priceDataWarningsV0}
        preRunViolations={preRunViolationsV0}
        preTradeCashCheck={preTradeCashCheck}
        rebalanceTableRows={rebalanceTableRows}
        smartDefaultsHints={smartDefaultsHintsV0}
        detectionReviewState={detectionReviewStateV0}
        setDetectionReviewState={setDetectionReviewStateV0}
        jumpTo={jumpTo}
        openPreflightForRun={() => openPreflightForRun()}
        onApplySmartDefaults={() => {
          persistExecutionModeV0('paper');
          persistSellProceedsRoutingV0('CASH');
          persistMaxTurnoverPct01V0(0.35);
          persistCashBucketTargetPct01V0(0.02);
          setWhatIfDriftThresholdPctV0(null);
          setRev((x) => x + 1);
        }}
      />
      <DaaRebalancePanelMaintainabilityCardsV0
        baseCcy={baseCcy}
        driftThresholdPct={driftThresholdPct}
        paperRunRecordedAt={paperRunRecordedAt}
        paperRunError={paperRunError}
        paperRunLoading={paperRunLoading}
        preRunViolationsV0={preRunViolationsV0}
        preTradeCashCheck={preTradeCashCheck}
        priceDataWarningsV0={priceDataWarningsV0}
        rebalanceTableRows={rebalanceTableRows}
        jumpTo={jumpTo}
        openPreflightForRun={openPreflightForRun}
        liquiditySettlementGateV0={liquiditySettlementGateV0}
        effectiveOrders={effectiveOrders}
        portfolioCash={portfolioCash}
      />
      <DaaRebalancePanelDecisionCardsV0
        rebalanceTableRows={rebalanceTableRows}
        priceDataWarningsV0={priceDataWarningsV0}
        driftThresholdPct={driftThresholdPct}
        liquiditySettlementGateV0={liquiditySettlementGateV0}
        preTradeCashCheck={preTradeCashCheck}
        baseCcy={baseCcy}
        jumpTo={jumpTo}
        openPreflightForRun={openPreflightForRun}
      />
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
            <DaaRebalanceRunOutcomePanelV0
              baseCcy={baseCcy}
              paperRunRecordedAt={paperRunRecordedAt}
              paperRunExecutionMode={paperRunExecutionMode}
              paperRunPostSummary={paperRunPostSummary}
              paperRunSummary={paperRunSummary}
              paperRunHealthcheck={paperRunHealthcheck}
              paperRunError={paperRunError}
              paperRunLoading={paperRunLoading}
              paperRunLastConfirmedOpts={paperRunLastConfirmedOpts}
              paperRunFailureDetails={paperRunFailureDetails}
              onRetry={() => {
                if (!paperRunLastConfirmedOpts) return;
                void runPaperRebalanceCore(paperRunLastConfirmedOpts);
              }}
              onReviewRetry={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})}
              onRunGuidedRecovery={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})}
              onJumpHistory={() => jumpTo('history-audit')}
            />
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
                    <DaaRebalanceWhatIfSectionV0
                      whatIf={whatIf}
                      baseCcy={baseCcy}
                      effectiveOrders={effectiveOrders}
                      whatIfRows={whatIfRows}
                      whatIfFeeBps={whatIfFeeBps}
                      setWhatIfFeeBps={setWhatIfFeeBps}
                      whatIfSlippageBps={whatIfSlippageBps}
                      setWhatIfSlippageBps={setWhatIfSlippageBps}
                      whatIfSlippageSensitivityV0={whatIfSlippageSensitivityV0}
                      setWhatIfSlippageSensitivityV0={setWhatIfSlippageSensitivityV0}
                      whatIfSlippageBpsUsed={whatIfSlippageBpsUsed}
                      whatIfAllocationDiffRowsV0={whatIfAllocationDiffRowsV0}
                      driftThresholdPct={driftThresholdPct}
                      taxLotsImpactV0={taxLotsImpactV0}
                    />
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
