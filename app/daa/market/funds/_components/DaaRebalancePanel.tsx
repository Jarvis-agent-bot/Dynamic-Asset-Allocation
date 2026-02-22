'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LS_AUTO_PLAN_INPUT, LS_AUTO_PLAN_RESULT, LS_AUTO_PLAN_RESULT_A, LS_AUTO_PLAN_RESULT_B, LS_AUTO_PLAN_SCENARIO_PRESETS_V0, LS_REBALANCE_ASSET_BLACKLIST_V0, LS_WHATIF_DRIFT_THRESHOLD_PCT_V0, LS_WHATIF_FEE_BPS, LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0, LS_WHATIF_SLIPPAGE_BPS, LS_WHATIF_SLIPPAGE_SENSITIVITY_V0, SLIPPAGE_SENSITIVITY_MULTIPLIER_V0, type AutoPlanScenarioKeyV0, type AutoPlanScenarioPresetV0, type OrdersPreviewSourceV0, type SlippageSensitivityV0, useLocalStorageFiniteNumberV0, useLocalStorageOptionalNumberV0, useLocalStorageStringV0 } from './DaaRebalancePanel.storageV0';
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
import { type DriftRebalanceBacktestResult } from '@/src/core/backtestDriftRebalance';
import { buildAutoPlanMarkdownV0 } from '@/src/core/autoPlanMarkdownV0';
import { getExecutionAdapterV0 } from '@/src/daa/executionAdapterV0';
import { getPreTradeCashCheckV0 } from '@/src/daa/preTradeCashCheckV0';
import { getLiquiditySettlementGateV0 } from '@/src/daa/liquiditySettlementGateV0';
import { appendRebalanceLog } from '@/src/daa/rebalanceLogStore';
import { buildRebalanceViolationsV0 } from '@/src/daa/rebalanceViolationsV0';
import { buildRebalanceApprovalSummaryMarkdownV0 } from '@/src/daa/rebalanceApprovalSummaryMarkdownV0';
import { attachOrdersToRebalanceRunV0, failRebalanceOrderStatusRunV0, finishRebalanceOrderStatusRunV0, startRebalanceOrderStatusRunV0, updateRebalanceOrderStatusV0 } from '@/src/daa/rebalanceOrderStatusRunStoreV0';
import { buildRebalancePostRunSummaryV0, type RebalancePostRunSummaryV0 } from '@/src/daa/rebalancePostRunSummary';
import { buildRebalancePlanCsvV0 } from '@/src/daa/rebalancePlanCsvV0';
import { estimateTaxLotsImpactV0 } from '@/src/daa/taxLotsImpactV0';
import { computeDriftAlertFromCoreResponse, computeDriftAlertFromTableRows, downloadTextAsFile, fmtPct01, formatOrdersMarkdown, formatWeightsDiffLines, formatWeightsMarkdown, normalizeOrders, normalizePlanSymbol, normalizeTargetWeights, normalizeTargetWeightsAny, pickFundNav, resolveFundPriceV0, safeJsonParse, scrollToId, toFiniteNumber, tryBuildSeriesBySymbolForPlan, type DriftAlertV0, type PaperRunHealthcheckV0, type SuggestedOrder, type TargetWeight } from './DaaRebalancePanel.helpersV0';
import { buildTargetedDecisionTransparencyV0 } from '@/src/daa/targetedDecisionTransparencyV0';
import { useDaaRuntime } from '../../../useDaaRuntime';
import { useDaaWorkflowExportBundleV1 } from '../../../useDaaWorkflowExportBundleV1';
import { LS_MONEY_PLAN, LS_REBALANCE_REQUEST, LS_REBALANCE_RESPONSE, WIZARD_DATA_EVENT, pretty, readJsonFromLs, saveJsonToLs } from '../../../wizardStorage';
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
import DaaRebalancePanelExtraInsightsV0 from './DaaRebalancePanelExtraInsightsV0';
import DaaRebalanceRiskControlsSectionV0 from './DaaRebalanceRiskControlsSectionV0';
import { applySampleScenarioV0 as applySampleScenarioWorkflowV0, jumpToV0, runDaaRefreshAndRecommendationV0 as runDaaRefreshAndRecommendationWorkflowV0 } from './DaaRebalancePanel.workflowHelpersV0';
import { getDriftBadgeV0, readAutoPlanBootstrapV0, readAutoPlanPresetsV0 } from './DaaRebalancePanel.autoPlanUtilsV0';
import { buildAutoPlanHoldingsMapV0, buildPricesMapV0, buildRunConstraintsV0, buildRunHoldingsMapV0, runAutoPlanV0 as runAutoPlanActionV0, seedAutoPlanFromCurrentSnapshotV0 as seedAutoPlanActionV0 } from './DaaRebalancePanel.planActionsV0';
import { useDaaRebalancePanelExecutionKernelV0 } from './DaaRebalancePanel.executionKernelV0';
type FundLike = { code: string; name?: string; dwjz?: string | number; gsz?: string | number; estPricedCoverage?: number; estGsz?: number };
type HoldingsLike = Record<string, { share: number; cost?: number }>;
type Props = { funds?: FundLike[]; holdings?: HoldingsLike };
type LiveTimelineEntryV0 = { id: string; at: string; stage: string; detail: string; level: 'info' | 'ok' | 'error' };

function useLiveTimelineV0(params: {
  runDaaStatus: 'idle' | 'running' | 'ok' | 'error';
  runDaaStatusText: string;
  paperRunLoading: boolean;
  paperRunError: string | null;
  paperRunRecordedAt: string | null;
}) {
  const { runDaaStatus, runDaaStatusText, paperRunLoading, paperRunError, paperRunRecordedAt } = params;
  const [liveTimelineV0, setLiveTimelineV0] = useState<LiveTimelineEntryV0[]>([]);
  const lastRunDaaStatusRef = useRef<typeof runDaaStatus>('idle');
  const lastPaperRunLoadingRef = useRef(false);
  const lastPaperRunRecordedAtRef = useRef<string | null>(null);
  const lastPaperRunErrorRef = useRef<string | null>(null);

  const pushLiveTimelineV0 = useCallback((entry: Omit<LiveTimelineEntryV0, 'id' | 'at'>) => {
    setLiveTimelineV0((prev) => [{ id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, at: new Date().toISOString(), ...entry }, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    if (runDaaStatus === lastRunDaaStatusRef.current) return;
    lastRunDaaStatusRef.current = runDaaStatus;
    if (runDaaStatus === 'running') pushLiveTimelineV0({ stage: 'Run DAA', detail: 'Step2 refresh + Step4 recommendation started.', level: 'info' });
    if (runDaaStatus === 'ok') pushLiveTimelineV0({ stage: 'Run DAA', detail: runDaaStatusText || 'Run DAA completed.', level: 'ok' });
    if (runDaaStatus === 'error') pushLiveTimelineV0({ stage: 'Run DAA', detail: runDaaStatusText || 'Run DAA failed.', level: 'error' });
  }, [runDaaStatus, runDaaStatusText, pushLiveTimelineV0]);

  useEffect(() => {
    if (paperRunLoading === lastPaperRunLoadingRef.current) return;
    lastPaperRunLoadingRef.current = paperRunLoading;
    if (paperRunLoading) pushLiveTimelineV0({ stage: 'Preflight execution', detail: 'Paper run started.', level: 'info' });
    if (!paperRunLoading && !paperRunError && paperRunRecordedAt) pushLiveTimelineV0({ stage: 'Preflight execution', detail: 'Paper run finished and recorded.', level: 'ok' });
  }, [paperRunLoading, paperRunError, paperRunRecordedAt, pushLiveTimelineV0]);

  useEffect(() => {
    if (!paperRunRecordedAt || paperRunRecordedAt === lastPaperRunRecordedAtRef.current) return;
    lastPaperRunRecordedAtRef.current = paperRunRecordedAt;
    pushLiveTimelineV0({ stage: 'Execution log', detail: `Recorded at ${paperRunRecordedAt}.`, level: 'ok' });
  }, [paperRunRecordedAt, pushLiveTimelineV0]);

  useEffect(() => {
    if (!paperRunError || paperRunError === lastPaperRunErrorRef.current) return;
    lastPaperRunErrorRef.current = paperRunError;
    pushLiveTimelineV0({ stage: 'Preflight execution', detail: paperRunError, level: 'error' });
  }, [paperRunError, pushLiveTimelineV0]);

  return liveTimelineV0;
}

// moved to DaaRebalancePanel.autoPlanUtilsV0

const PREVIEW_ORDER_OPTIONS_V0: Array<{ key: OrdersPreviewSourceV0; label: string; title: string }> = [{ key: 'RECOMPUTE', label: 'Recompute', title: 'Recompute orders via the core engine using current inputs + threshold' }, { key: 'ENGINE_LAST_RUN', label: 'Last run (core)', title: 'Use orders from the last core run (saved in localStorage)' }];

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
  const autoPlanBootstrapV0 = useMemo(() => readAutoPlanBootstrapV0(), []);
  const [autoPlanScenario, setAutoPlanScenario] = useState<AutoPlanScenarioKeyV0>(autoPlanBootstrapV0.scenario);
  const [autoPlanInputTextA, setAutoPlanInputTextA] = useState(autoPlanBootstrapV0.textA);
  const [autoPlanInputTextB, setAutoPlanInputTextB] = useState(autoPlanBootstrapV0.textB);
  const [autoPlanThresholdOverridePctA, setAutoPlanThresholdOverridePctA] = useState<number | null>(autoPlanBootstrapV0.thresholdA);
  const [autoPlanThresholdOverridePctB, setAutoPlanThresholdOverridePctB] = useState<number | null>(autoPlanBootstrapV0.thresholdB);
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
  const [detectionReviewStateV0, setDetectionReviewStateV0] = useState<Record<string, 'approved' | 'rejected'>>({});
  useEffect(() => {
    if (executionMode !== 'live') return;
    persistExecutionModeV0('paper');
    setRev((x) => x + 1);
  }, [executionMode]);
  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener('storage', onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener('storage', onData);
    };
  }, []);
  // timeline handlers + side effects moved into useLiveTimelineV0
  useEffect(() => {
    // Persist the latest drift input(s) so users can refresh and keep the plan editor state.
    saveJsonToLs(LS_AUTO_PLAN_INPUT, { schemaVersion: 2, active: autoPlanScenario, a: { text: autoPlanInputTextA, thresholdPctOverride: autoPlanThresholdOverridePctA }, b: { text: autoPlanInputTextB, thresholdPctOverride: autoPlanThresholdOverridePctB } });
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
  const autoPlanActiveState = autoPlanScenario === 'A'
    ? { inputText: autoPlanInputTextA, thresholdOverridePct: autoPlanThresholdOverridePctA, result: autoPlanResultA, error: autoPlanErrorA, setInputText: setAutoPlanInputTextA, setThresholdOverridePct: setAutoPlanThresholdOverridePctA, setError: setAutoPlanErrorA, setResult: setAutoPlanResultA }
    : { inputText: autoPlanInputTextB, thresholdOverridePct: autoPlanThresholdOverridePctB, result: autoPlanResultB, error: autoPlanErrorB, setInputText: setAutoPlanInputTextB, setThresholdOverridePct: setAutoPlanThresholdOverridePctB, setError: setAutoPlanErrorB, setResult: setAutoPlanResultB };
  const autoPlanInputText = autoPlanActiveState.inputText;
  const autoPlanThresholdOverridePct = autoPlanActiveState.thresholdOverridePct;
  const autoPlanThresholdPctUsed = autoPlanThresholdOverridePct !== null ? autoPlanThresholdOverridePct : driftThresholdPct;
  const autoPlanResult = autoPlanActiveState.result;
  const autoPlanError = autoPlanActiveState.error;
  const setAutoPlanInputTextForActive = autoPlanActiveState.setInputText;
  const setAutoPlanThresholdOverridePctForActive = autoPlanActiveState.setThresholdOverridePct;
  const setAutoPlanErrorForActive = autoPlanActiveState.setError;
  const setAutoPlanResultForActive = autoPlanActiveState.setResult;
  const applyAutoPlanPresetV0 = useCallback((preset: AutoPlanScenarioPresetV0) => {
    setAutoPlanInputTextA(preset.inputA);
    setAutoPlanInputTextB(preset.inputB);
    setAutoPlanThresholdOverridePctA(preset.thresholdPctOverrideA);
    setAutoPlanThresholdOverridePctB(preset.thresholdPctOverrideB);
    setAutoPlanScenario('A');
  }, []);
  function saveAutoPlanScenarioPresetV0() {
    const name = autoPlanPresetNameV0.trim();
    if (!name) return;
    const id = `${Date.now()}`;
    setAutoPlanPresetsV0((prev) => [{ id, name, updatedAt: new Date().toISOString(), inputA: autoPlanInputTextA, inputB: autoPlanInputTextB, thresholdPctOverrideA: autoPlanThresholdOverridePctA, thresholdPctOverrideB: autoPlanThresholdOverridePctB }, ...prev].slice(0, 20));
    setAutoPlanSelectedPresetIdV0(id);
    setAutoPlanPresetNameV0('');
  }
  function loadAutoPlanScenarioPresetV0(id: string) {
    const preset = autoPlanPresetsV0.find((x) => x.id === id);
    if (preset) applyAutoPlanPresetV0(preset);
  }
  function deleteAutoPlanScenarioPresetV0(id: string) {
    setAutoPlanPresetsV0((prev) => prev.filter((x) => x.id !== id));
    setAutoPlanSelectedPresetIdV0((prev) => (prev === id ? '' : prev));
  }
  const baseCcy = useMemo(() => {
    const mp: any = moneyPlan as any;
    return typeof mp?.account?.baseCcy === 'string' ? String(mp.account.baseCcy) : null;
  }, [moneyPlan]);
  // smartDefaultsHintsV0 is defined after target/price data so dependencies are initialized.
  async function withCopyStatus(setter: (next: 'idle' | 'ok' | 'error') => void, fn: () => Promise<void>) {
    try {
      await fn();
      setter('ok');
      window.setTimeout(() => setter('idle'), 1200);
    } catch {
      setter('error');
      window.setTimeout(() => setter('idle'), 2000);
    }
  }
  async function doCopyBundle() { await withCopyStatus(setCopyStatus, async () => copyTextToClipboard(pretty(exportBundle))); }
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
  const analystCorrelationDiversityCheckV0 = useMemo(() => {
    const bucketCounts = new Map<string, number>();
    for (const row of rebalanceTableRows) {
      const weight = Math.max(0, Math.abs(toFiniteNumber(row.targetPct) ?? 0));
      if (!(weight > 0)) continue;
      const normalizedId = String(row.id ?? '').trim().toUpperCase();
      const bucket = normalizedId.slice(0, 2) || 'OTHER';
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    }
    const totalBuckets = Array.from(bucketCounts.values()).reduce((acc, value) => acc + value, 0);
    const topCount = totalBuckets > 0 ? Math.max(...Array.from(bucketCounts.values())) : 0;
    const topShare = totalBuckets > 0 ? topCount / totalBuckets : 0;
    const concentrationRisk = topShare >= 0.55 || bucketCounts.size <= 2;
    return { bucketCounts, topShare, concentrationRisk };
  }, [rebalanceTableRows]);
  const topShare = analystCorrelationDiversityCheckV0.topShare; const concentrationRisk = analystCorrelationDiversityCheckV0.concentrationRisk;
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
  const whatIfThresholdPct100 = Math.max(0, driftThresholdPct * 100);
  const policyThresholdPct100 = Math.max(0, policyDriftThresholdPct * 100);
  const thresholdPresetsV0 = useMemo(() => [
    { id: 'conservative', label: 'Conservative', pct100: 2.0, title: '2.00% (fewer rebalances)' },
    { id: 'standard', label: 'Standard', pct100: 1.0, title: '1.00% (default-ish)' },
    { id: 'aggressive', label: 'Aggressive', pct100: 0.5, title: '0.50% (more rebalances)' },
  ] as const, []);
  const activeThresholdPresetIdV0 = thresholdPresetsV0.find((preset) => Math.abs(whatIfThresholdPct100 - preset.pct100) < 1e-6)?.id ?? null;
  const setWhatIfThresholdPct100V0 = useCallback(
    (pct100: number | null) => {
      if (pct100 === null) {
        setWhatIfDriftThresholdPctV0(null);
        return;
      }
      const value = Number(pct100);
      if (!Number.isFinite(value) || value < 0) return;
      setWhatIfDriftThresholdPctV0(value / 100);
    },
    [setWhatIfDriftThresholdPctV0],
  );
  // policyImpactSimulatorV0 declared after whatIf is available.
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
      const constraints = buildRunConstraintsV0(mp, assetBlacklistV0);
      const holdingsMap = buildRunHoldingsMapV0(st.positions, assetBlacklistSetV0);
      const pricesMap = buildPricesMapV0({ funds, priceSnapshot, holdingsMap, targetWeightsInput: targetWeightsEffective });
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
  const policyImpactSimulatorV0 = useMemo(() => {
    const overCount = rebalanceTableRows.filter((r) => r.deltaPct >= driftThresholdPct).length;
    const underCount = rebalanceTableRows.filter((r) => r.deltaPct <= -driftThresholdPct).length;
    const maxAbsDriftPct = rebalanceTableRows.length ? Math.max(...rebalanceTableRows.map((r) => Math.abs(r.deltaPct))) * 100 : 0;
    const turnoverPct = whatIf && Number.isFinite(whatIf.turnoverPctOfTotalBefore) ? whatIf.turnoverPctOfTotalBefore * 100 : null;
    const feeBps = Number.isFinite(whatIfFeeBps) ? whatIfFeeBps : 0;
    const slippageBps = Number.isFinite(whatIfSlippageBpsUsed) ? whatIfSlippageBpsUsed : 0;
    const riskLevel =
      maxAbsDriftPct >= 5 || (turnoverPct !== null && turnoverPct >= 35)
        ? 'High'
        : maxAbsDriftPct >= 2 || (turnoverPct !== null && turnoverPct >= 15)
          ? 'Medium'
          : 'Low';
    return { overCount, underCount, maxAbsDriftPct, turnoverPct, feeBps, slippageBps, riskLevel };
  }, [driftThresholdPct, rebalanceTableRows, whatIf, whatIfFeeBps, whatIfSlippageBpsUsed]);
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
  const ccySuffix = baseCcy ? ` ${baseCcy}` : '';
  const suppressedExamplesText = useMemo(() => {
    if (!naiveOrdersDiagnostics) return '';
    return (naiveOrdersDiagnostics.suppressedTop || [])
      .map((x) => `${x.side} ${x.id}: raw=${x.rawNotional.toFixed(2)}${ccySuffix} -> rounded=${x.roundedNotional.toFixed(2)}${ccySuffix}`)
      .join('; ');
  }, [ccySuffix, naiveOrdersDiagnostics]);
  const noOrdersHint = useMemo(() => {
    const diag = ordersPreviewSourceV0 === 'RECOMPUTE' && !corePreview?.resp ? naiveOrdersDiagnostics : null;
    if (diag && diag.candidateCount > 0 && diag.producedCount === 0) {
      return {
        kind: 'blocked' as const,
        text: `Blocked by min trade/precision: ${diag.candidateCount} candidate trade(s), but all are below minNotional=${diag.minNotional.toFixed(2)}${ccySuffix}${diag.lotStep > 0 ? ` (lotStep=${diag.lotStep.toFixed(2)}${ccySuffix})` : ''}.`,
      };
    }
    if (diag && diag.candidateCount === 0) {
      return {
        kind: 'empty' as const,
        text: `No orders: all drifts are within threshold (${(driftThresholdPct * 100).toFixed(2)}%). Lower the threshold if you expect more rebalances.`,
      };
    }
    return {
      kind: 'pending' as const,
      text: `暂无 orders：请先跑一次 Step4，或确保 current vs target 数据齐全。（minTradeNotional=${rebalancePolicy.minTradeNotional.toFixed(2)}）`,
    };
  }, [ccySuffix, corePreview?.resp, driftThresholdPct, naiveOrdersDiagnostics, ordersPreviewSourceV0, rebalancePolicy.minTradeNotional]);
  async function doCopyOrders() {
    await withCopyStatus(setCopyOrdersStatus, async () => {
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
    });
  }
  async function doCopyApprovalSummaryV0() {
    await withCopyStatus(setCopyApprovalSummaryStatus, async () => {
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
    });
  }
  async function doCopyWeights() {
    await withCopyStatus(setCopyWeightsStatus, async () => {
      const text = [
        '# Current vs Target (v0)',
        '',
        formatWeightsMarkdown(rebalanceTableRows),
        '',
        '```json',
        JSON.stringify({ at: new Date().toISOString(), rows: rebalanceTableRows }, null, 2),
        '```'].join('\n');
      await copyTextToClipboard(text);
    });
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
    await withCopyStatus(setAutoPlanCopyStatus, async () => {
      const md = buildAutoPlanMarkdownV0(autoPlanResult);
      await copyTextToClipboard(md);
    });
  }
  const seedAutoPlanFromCurrentSnapshotV0 = useCallback(() => {
    seedAutoPlanActionV0({
      funds,
      priceSnapshot,
      targetWeightsEffective,
      assetBlacklistSetV0,
      setAutoPlanErrorForActive,
      setAutoPlanInputTextForActive,
    });
  }, [assetBlacklistSetV0, funds, priceSnapshot, setAutoPlanErrorForActive, setAutoPlanInputTextForActive, targetWeightsEffective]);
  const runAutoPlanV0 = useCallback(() => {
    runAutoPlanActionV0({
      autoPlanScenario,
      autoPlanInputText,
      autoPlanThresholdPctUsed,
      rebalancePolicy,
      targetWeights,
      targetWeightsEffective,
      moneyPlan,
      assetBlacklistV0,
      assetBlacklistSetV0,
      setAutoPlanErrorForActive,
      setAutoPlanResultForActive,
    });
  }, [
    assetBlacklistSetV0,
    assetBlacklistV0,
    autoPlanInputText,
    autoPlanScenario,
    autoPlanThresholdPctUsed,
    moneyPlan,
    rebalancePolicy,
    setAutoPlanErrorForActive,
    setAutoPlanResultForActive,
    targetWeights,
    targetWeightsEffective,
  ]);
  const {
    paperRunLoading,
    paperRunError,
    paperRunRecordedAt,
    paperRunSummary,
    paperRunPostSummary,
    paperRunHealthcheck,
    paperRunDriftAlert,
    paperRunExecutionMode,
    paperRunLastConfirmedOpts,
    paperRunFailureDetails,
    preflightOpen,
    preflightPendingOpts,
    preflightAckPrices,
    preflightAckConstraints,
    preflightAckCash,
    preflightOverrideBlockers,
    preflightHasPriceWarnings,
    preflightCanProceed,
    safetyStopOpen,
    safetyStopPendingOpts,
    preRunHasBlockingV0,
    preRunHasWarningsV0,
    preflightPreviewOrders,
    preflightPreviewWhatIf,
    safetyStopPreviewOrders,
    safetyStopPreviewWhatIf,
    setPreflightAckPrices,
    setPreflightAckConstraints,
    setPreflightAckCash,
    setPreflightOverrideBlockers,
    openPreflightForRun,
    closePreflight,
    closePreflightAndJump,
    closeSafetyStop,
    safetyStopDisableDynamicScheduleV0,
    proceedFromPreflight,
    proceedFromSafetyStop,
    runPaperRebalanceCore,
    cancelRun,
  } = useDaaRebalancePanelExecutionKernelV0({
    executionModeNormalized,
    preTradeCashCheck,
    liquiditySettlementGateV0,
    rebalanceTableRows,
    driftThresholdPct,
    moneyPlan,
    assetBlacklistV0,
    assetBlacklistSetV0,
    funds,
    priceSnapshot,
    targetWeightsEffective,
    effectiveOrders,
    whatIfTargetWeightsPostBySymbol,
    whatIfFeeBps,
    whatIfSlippageBpsUsed,
    whatIfLabelsBySymbol,
    sellProceedsRoutingV0,
    corePreviewReq: corePreview?.req ?? null,
    portfolioCash,
    whatIfValuesBySymbol,
    preRunViolationsV0,
    priceDataWarningsV0,
  });
  const liveTimelineV0 = useLiveTimelineV0({
    runDaaStatus,
    runDaaStatusText,
    paperRunLoading,
    paperRunError,
    paperRunRecordedAt,
  });
  const riskControlsSectionProps = { targetWeightsSource, priceDataWarningsV0, assetBlacklistTextV0, setAssetBlacklistTextV0, cashBucketTargetPct01, persistCashBucketTargetPct01V0, maxTurnoverPct01V0, persistMaxTurnoverPct01V0, baseCcy, rebalancePolicyMinTradeNotional: rebalancePolicy.minTradeNotional, whatIfTurnoverPctOfTotalBefore: whatIf ? whatIf.turnoverPctOfTotalBefore : null, investablePct01, moneyPlanInvestablePct01, assetBlacklistV0, portfolioLastRebalanceAt };
  const autoPlanSectionProps = { autoPlanScenario, setAutoPlanScenario, autoPlanPresetNameV0, setAutoPlanPresetNameV0, saveAutoPlanScenarioPresetV0, autoPlanSelectedPresetIdV0, setAutoPlanSelectedPresetIdV0, autoPlanPresetsV0, loadAutoPlanScenarioPresetV0, deleteAutoPlanScenarioPresetV0, seedAutoPlanFromCurrentSnapshotV0, runAutoPlanV0, doCopyAutoPlanV0, autoPlanResult, autoPlanCopyStatus, autoPlanThresholdOverridePct, driftThresholdPct, setAutoPlanThresholdOverridePctForActive, autoPlanThresholdPctUsed, autoPlanInputText, setAutoPlanInputTextForActive, autoPlanError, autoPlanResultA, autoPlanResultB, baseCcy, formatWeightsDiffLines, rebalanceMinTradeNotional: rebalancePolicy.minTradeNotional, whatIfFeeBps };
  return (
    <div id="daa-panel" className="col-12 glass card" role="region" aria-label="DAA Workflow 面板">
      <DaaRebalancePreflightModalV0 open={preflightOpen} pendingOpts={preflightPendingOpts} baseCcy={baseCcy} previewOrders={preflightPreviewOrders} previewWhatIf={preflightPreviewWhatIf} hasPriceWarnings={preflightHasPriceWarnings} priceWarnings={priceDataWarningsV0} hasBlocking={preRunHasBlockingV0} hasWarnings={preRunHasWarningsV0} violations={preRunViolationsV0} preTradeCashCheck={preTradeCashCheck} ackPrices={preflightAckPrices} ackConstraints={preflightAckConstraints} ackCash={preflightAckCash} overrideBlockers={preflightOverrideBlockers} canProceed={preflightCanProceed} loading={paperRunLoading} executionBlockReason={executionBlockReason} targetWeightsCount={targetWeights.length} onClose={closePreflight} onJump={closePreflightAndJump} onSetAckPrices={setPreflightAckPrices} onSetAckConstraints={setPreflightAckConstraints} onSetAckCash={setPreflightAckCash} onSetOverrideBlockers={setPreflightOverrideBlockers} onProceed={proceedFromPreflight} />
      <DaaSafetyStopModalV0 open={safetyStopOpen} pendingCashSweep={!!safetyStopPendingOpts?.cashSweep} copyApprovalSummaryStatus={copyApprovalSummaryStatus} previewOrders={safetyStopPreviewOrders} previewWhatIf={safetyStopPreviewWhatIf} baseCcy={baseCcy} whatIfFeeBps={whatIfFeeBps} whatIfSlippageBps={whatIfSlippageBps} whatIfSlippageBpsUsed={whatIfSlippageBpsUsed} whatIfSlippageSensitivity={whatIfSlippageSensitivityV0} preRunViolations={preRunViolationsV0} preTradeCashBlocking={preTradeCashCheck.blocking} preflightOverrideBlockers={preflightOverrideBlockers} portfolioCash={toFiniteNumber(portfolioCash) ?? 0} minTradeNotional={rebalancePolicy.minTradeNotional} paperRunLoading={paperRunLoading} executionBlockReason={executionBlockReason} targetWeightsCount={targetWeights.length} onCopyApprovalSummary={doCopyApprovalSummaryV0} onClose={closeSafetyStop} onSafetyStopDisableSchedule={safetyStopDisableDynamicScheduleV0} onProceed={proceedFromSafetyStop} />
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
        onCancelRun={cancelRun}
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
      <div className="card" style={{ padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Analyst correlation-diversity check</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Prevent hidden concentration by checking cross-bucket style diversity.</div>
        <div style={{ marginTop: 6, fontSize: 11 }}>buckets=<b>{analystCorrelationDiversityCheckV0.bucketCounts.size}</b> · top correlation bucket share=<b>{(topShare * 100).toFixed(1)}%</b> · status=<b style={{ color: concentrationRisk ? 'var(--danger)' : '#16a34a' }}>{concentrationRisk ? 'hidden concentration risk' : 'diversity acceptable'}</b></div>
        <div style={{ marginTop: 8 }}><button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>Stage de-correlation orders</button></div>
      </div>
      <DaaRebalancePanelExtraInsightsV0
        baseCcy={baseCcy}
        portfolioCash={toFiniteNumber(portfolioCash) ?? 0}
        rebalanceTableRows={rebalanceTableRows}
        effectiveOrders={effectiveOrders}
        priceDataWarningsV0={priceDataWarningsV0}
        preRunViolationsV0={preRunViolationsV0}
        preTradeCashCheck={preTradeCashCheck}
        driftThresholdPct={driftThresholdPct}
        paperRunError={paperRunError}
        jumpTo={jumpTo}
        openPreflightForRun={() => openPreflightForRun()}
      />
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
          {[
            { id: 'portfolio', node: <DaaPortfolioEditorV0 /> },
            { id: 'prices', node: <DaaPriceSnapshotInputV0 /> },
            { id: 'target-weights', node: <DaaTargetWeightsEditorV0 /> },
            { id: 'policy', node: <DaaRebalancePolicyEditorV0 /> },
            { id: 'schedule', node: <DaaRebalanceScheduleV0 /> },
            { id: 'notifications', node: <DaaDynamicRebalanceNotificationsV0 /> },
            { id: 'okx-sandbox', node: <DaaOkxSandboxBalancesV0 /> },
          ].map((section) => (
            <div key={section.id} id={section.id} style={{ scrollMarginTop: 12 }}>
              {section.node}
            </div>
          ))}
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
                    onClick={cancelRun}
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
            <DaaRebalanceRiskControlsSectionV0 {...riskControlsSectionProps} />
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
            <DaaRebalanceRunOutcomePanelV0 baseCcy={baseCcy} paperRunRecordedAt={paperRunRecordedAt} paperRunExecutionMode={paperRunExecutionMode} paperRunPostSummary={paperRunPostSummary} paperRunSummary={paperRunSummary} paperRunHealthcheck={paperRunHealthcheck} paperRunError={paperRunError} paperRunLoading={paperRunLoading} paperRunLastConfirmedOpts={paperRunLastConfirmedOpts} paperRunFailureDetails={paperRunFailureDetails} onRetry={() => { if (!paperRunLastConfirmedOpts) return; void runPaperRebalanceCore(paperRunLastConfirmedOpts); }} onReviewRetry={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})} onRunGuidedRecovery={() => openPreflightForRun(paperRunLastConfirmedOpts ?? {})} onJumpHistory={() => jumpTo('history-audit')} />
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
                  {([
                    { key: 'targets', label: 'Fix targets', onClick: () => jumpTo('target-weights'), disabled: false },
                    { key: 'prices', label: 'Refresh prices', onClick: () => jumpTo('prices'), disabled: false },
                    { key: 'recovery', label: 'Open guided recovery', onClick: () => openPreflightForRun(paperRunLastConfirmedOpts ?? {}), disabled: paperRunLoading },
                  ] as const).map((action) => (
                    <button key={action.key} type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={action.onClick} disabled={action.disabled}>
                      {action.label}
                    </button>
                  ))}
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
                  {([
                    { key: 'all', label: 'All', count: driftCounts.total, disabled: false },
                    { key: 'over', label: 'Over target', count: driftCounts.over, disabled: !driftCounts.over },
                    { key: 'under', label: 'Under target', count: driftCounts.under, disabled: !driftCounts.under },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={driftFilter === item.key ? 'button' : 'button secondary'}
                      onClick={() => setDriftFilter(item.key)}
                      style={{ padding: '4px 8px' }}
                      aria-pressed={driftFilter === item.key}
                      disabled={item.disabled}
                    >
                      {item.label} <span className="muted">({item.count})</span>
                    </button>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', marginLeft: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>threshold</span>
                    <span className="muted" style={{ fontSize: 12 }}>presets</span>
                    {thresholdPresetsV0.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={activeThresholdPresetIdV0 === preset.id ? 'button' : 'button secondary'}
                        onClick={() => setWhatIfThresholdPct100V0(preset.pct100)}
                        style={{ padding: '4px 8px' }}
                        title={preset.title}
                        aria-pressed={activeThresholdPresetIdV0 === preset.id}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.1}
                      value={whatIfThresholdPct100}
                      onChange={(e) => {
                        const value = toFiniteNumber((e.target as HTMLInputElement).value);
                        if (value === null) return;
                        setWhatIfThresholdPct100V0(value);
                      }}
                      style={{ width: 160 }}
                      aria-label="What-if drift threshold percent"
                    />
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={0.1}
                      value={whatIfThresholdPct100.toFixed(2)}
                      onChange={(e) => {
                        const value = toFiniteNumber((e.target as HTMLInputElement).value);
                        if (value === null) return;
                        setWhatIfThresholdPct100V0(value);
                      }}
                      style={{ width: 84, padding: '4px 6px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'inherit' }}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>%</span>
                    {whatIfDriftThresholdPctV0 !== null ? (
                      <button type="button" className="button secondary" onClick={() => setWhatIfThresholdPct100V0(null)} style={{ padding: '4px 8px' }}>
                        Reset
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>policy={policyThresholdPct100.toFixed(2)}%</span>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, background: 'rgba(0,0,0,0.1)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Policy impact simulator</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Preview allocation + risk posture before confirm (drift threshold / fees / slippage).</div>
                  <div style={{ marginTop: 5, fontSize: 11 }}>
                    drift over=<b>{policyImpactSimulatorV0.overCount}</b>, under=<b>{policyImpactSimulatorV0.underCount}</b>, maxAbs≈<b>{policyImpactSimulatorV0.maxAbsDriftPct.toFixed(2)}%</b>
                    {' '}· turnover≈<b>{policyImpactSimulatorV0.turnoverPct !== null ? `${policyImpactSimulatorV0.turnoverPct.toFixed(2)}%` : 'n/a'}</b>
                    {' '}· fee/slippage=<b>{policyImpactSimulatorV0.feeBps.toFixed(1)} / {policyImpactSimulatorV0.slippageBps.toFixed(1)} bps</b>
                    {' '}· risk=<b style={{ color: policyImpactSimulatorV0.riskLevel === 'High' ? 'var(--danger)' : policyImpactSimulatorV0.riskLevel === 'Medium' ? '#f59e0b' : '#16a34a' }}>{policyImpactSimulatorV0.riskLevel}</b>
                  </div>
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
                          const driftBadge = getDriftBadgeV0(delta, driftThresholdPct);
                          return (
                            <tr key={r.id}>
                              <td style={{ padding: '6px 0' }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                                  <span>
                                    {r.label} <span className="muted">({r.id})</span>
                                  </span>
                                  <span
                                    className="badge"
                                    style={{ padding: '2px 8px', fontSize: 11, borderColor: driftBadge.color, color: driftBadge.color, background: 'rgba(0,0,0,0.12)' }}
                                    title={`drift ${(delta * 100).toFixed(2)}% vs target`}
                                  >
                                    {driftBadge.text}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.currentPct * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.targetPct * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color: driftBadge.valueColor }}>{(delta * 100).toFixed(1)}%</td>
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
                        const driftBadge = r.driftPct === null ? null : getDriftBadgeV0(r.driftPct, driftThresholdPct);
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
                                <span className="badge" style={{ padding: '2px 8px', fontSize: 11, borderColor: driftBadge?.color ?? 'var(--muted)', color: driftBadge?.color ?? 'var(--muted)', background: 'rgba(0,0,0,0.12)' }}>
                                  {(r.notionalPct * 100).toFixed(2)}% equity
                                </span>
                              ) : null}
                              {driftBadge ? (
                                <span
                                  className="badge"
                                  style={{ padding: '2px 8px', fontSize: 11, borderColor: driftBadge.color, color: driftBadge.color, background: 'rgba(0,0,0,0.12)' }}
                                  title="currentPct - targetPct"
                                >
                                  {driftBadge.text}
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
                    {PREVIEW_ORDER_OPTIONS_V0.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={ordersPreviewSourceV0 === option.key ? 'button' : 'button secondary'}
                        onClick={() => setOrdersPreviewSourceV0(option.key)}
                        style={{ padding: '4px 8px' }}
                        aria-pressed={ordersPreviewSourceV0 === option.key}
                        disabled={option.key === 'ENGINE_LAST_RUN' && !engineOrders.length}
                        title={option.title}
                      >
                        {option.label}
                      </button>
                    ))}
                    <span className="muted" style={{ fontSize: 11 }}>
                      {ordersPreviewSourceV0 === 'ENGINE_LAST_RUN'
                        ? 'Using saved engine orders; adjust threshold then re-run core to refresh.'
                        : 'Computed by core; adjusts with the threshold slider.'}
                    </span>
                  </div>
                  {ordersPreviewSourceV0 === 'RECOMPUTE' && !corePreview?.resp && naiveOrdersDiagnostics && naiveOrdersDiagnostics.suppressedCount ? (
                    <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                      Min trade/precision: suppressed {naiveOrdersDiagnostics.suppressedCount} candidate trade(s) below minNotional={naiveOrdersDiagnostics.minNotional.toFixed(2)}{ccySuffix}
                      {naiveOrdersDiagnostics.lotStep > 0 ? ` (lotStep=${naiveOrdersDiagnostics.lotStep.toFixed(2)}${ccySuffix})` : ''}.
                      {suppressedExamplesText ? ` Examples: ${suppressedExamplesText}.` : ''}
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
                  <div style={noOrdersHint.kind === 'blocked' ? { color: 'var(--danger, #b00020)' } : undefined}>{noOrdersHint.text}</div>
                  {noOrdersHint.kind === 'blocked' ? (
                    <>
                      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                        Suggestion: lower policy.minTradeNotional, or increase position size/equity so the implied notional deltas exceed the minimum.
                      </div>
                      {suppressedExamplesText ? (
                        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                          Examples: {suppressedExamplesText}.
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <DaaRebalancePanelAutoPlanSectionV0 {...autoPlanSectionProps} />
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
