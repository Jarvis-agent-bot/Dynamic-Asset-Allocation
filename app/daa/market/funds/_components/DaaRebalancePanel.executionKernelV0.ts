import { useCallback, useMemo, useRef, useState } from 'react';
import { loadPortfolioStateV1, recordPortfolioLastRebalance } from '../../../portfolioStateStore';
import { loadRebalancePolicyV1 } from '../../../rebalancePolicyStore';
import { loadRebalanceScheduleStateV1, persistRebalanceScheduleV1 } from '../../../rebalanceScheduleStore';
import { persistExecutionModeV0, type ExecutionModeV0 } from '../../../executionModeStore';
import { pushDynamicRebalanceNotificationV0 } from '../../../dynamicRebalanceNotificationsClientV0';
import { appendRebalanceLog } from '@/src/daa/rebalanceLogStore';
import { getExecutionAdapterV0 } from '@/src/daa/executionAdapterV0';
import { getPreTradeCashCheckV0 } from '@/src/daa/preTradeCashCheckV0';
import { attachOrdersToRebalanceRunV0, failRebalanceOrderStatusRunV0, finishRebalanceOrderStatusRunV0, startRebalanceOrderStatusRunV0, updateRebalanceOrderStatusV0 } from '@/src/daa/rebalanceOrderStatusRunStoreV0';
import { buildRebalancePostRunSummaryV0, type RebalancePostRunSummaryV0 } from '@/src/daa/rebalancePostRunSummary';
import { rebalanceCore, type RebalanceCoreRequest } from '@/src/core/rebalanceCore';
import { simulateRebalanceWhatIfV0 } from '@/src/core/rebalanceWhatIf';
import { LS_REBALANCE_REQUEST, LS_REBALANCE_RESPONSE, WIZARD_DATA_EVENT, pretty, saveJsonToLs } from '../../../wizardStorage';
import { computeDriftAlertFromCoreResponse, computeDriftAlertFromTableRows, fmtPct01, normalizeOrders, safeJsonParse, scrollToId, toFiniteNumber, type DriftAlertV0, type PaperRunHealthcheckV0, type SuggestedOrder } from './DaaRebalancePanel.helpersV0';
import { buildPricesMapV0, buildRunConstraintsV0, buildRunHoldingsMapV0 } from './DaaRebalancePanel.planActionsV0';

type RunOpts = { cashSweep?: boolean };

type Params = {
  executionModeNormalized: ExecutionModeV0;
  preTradeCashCheck: { blocking: boolean; message: string };
  liquiditySettlementGateV0: { blocked: boolean; message: string };
  rebalanceTableRows: any[];
  driftThresholdPct: number;
  moneyPlan: unknown;
  assetBlacklistV0: string[];
  assetBlacklistSetV0: Set<string>;
  funds: any[] | undefined;
  priceSnapshot: unknown;
  targetWeightsEffective: any[];
  effectiveOrders: SuggestedOrder[];
  whatIfTargetWeightsPostBySymbol: Record<string, number>;
  whatIfFeeBps: number;
  whatIfSlippageBpsUsed: number;
  whatIfLabelsBySymbol: Record<string, string>;
  sellProceedsRoutingV0: any;
  corePreviewReq: RebalanceCoreRequest | null;
  portfolioCash: number | null;
  whatIfValuesBySymbol: Record<string, number>;
  preRunViolationsV0: Array<{ level?: string }>;
  priceDataWarningsV0: { missing: unknown[]; lastClose: unknown[] };
};

export function useDaaRebalancePanelExecutionKernelV0(params: Params) {
  const {
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
    corePreviewReq,
    portfolioCash,
    whatIfValuesBySymbol,
    preRunViolationsV0,
    priceDataWarningsV0,
  } = params;

  const [paperRunLoading, setPaperRunLoading] = useState(false);
  const [paperRunError, setPaperRunError] = useState<string | null>(null);
  const [paperRunRecordedAt, setPaperRunRecordedAt] = useState<string | null>(null);
  const [paperRunSummary, setPaperRunSummary] = useState<string | null>(null);
  const [paperRunPostSummary, setPaperRunPostSummary] = useState<RebalancePostRunSummaryV0 | null>(null);
  const [paperRunHealthcheck, setPaperRunHealthcheck] = useState<PaperRunHealthcheckV0 | null>(null);
  const [paperRunDriftAlert, setPaperRunDriftAlert] = useState<DriftAlertV0 | null>(null);
  const [paperRunExecutionMode, setPaperRunExecutionMode] = useState<ExecutionModeV0>('paper');
  const paperRunAbortRef = useRef<AbortController | null>(null);
  const [paperRunLastConfirmedOpts, setPaperRunLastConfirmedOpts] = useState<RunOpts | null>(null);
  const [paperRunFailureDetails, setPaperRunFailureDetails] = useState<string | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightPendingOpts, setPreflightPendingOpts] = useState<RunOpts | null>(null);
  const [preflightAckPrices, setPreflightAckPrices] = useState(false);
  const [preflightAckConstraints, setPreflightAckConstraints] = useState(false);
  const [preflightAckCash, setPreflightAckCash] = useState(false);
  const [preflightOverrideBlockers, setPreflightOverrideBlockers] = useState(false);
  const [safetyStopOpen, setSafetyStopOpen] = useState(false);
  const [safetyStopPendingOpts, setSafetyStopPendingOpts] = useState<RunOpts | null>(null);

  const preRunHasBlockingV0 = preRunViolationsV0.some((v) => v.level === 'blocker');
  const preRunHasWarningsV0 = preRunViolationsV0.some((v) => v.level === 'warning');
  const preflightHasPriceWarnings = priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0;
  const preflightCanProceed =
    preflightAckPrices &&
    preflightAckConstraints &&
    preflightAckCash &&
    (!preRunHasBlockingV0 || preflightOverrideBlockers);

  const previewOrdersForOpts = useCallback((pendingCashSweep: boolean) => {
    if (!pendingCashSweep) return effectiveOrders;
    try {
      if (!corePreviewReq) return effectiveOrders;
      const reqSweep: RebalanceCoreRequest = {
        ...corePreviewReq,
        policy: {
          ...((corePreviewReq as any).policy ?? {}),
          thresholdPct: 0,
          cashSweepToTarget: true,
        },
      };
      return normalizeOrders(rebalanceCore(reqSweep).orders);
    } catch {
      return effectiveOrders;
    }
  }, [corePreviewReq, effectiveOrders]);

  const buildPreviewWhatIf = useCallback((orders: SuggestedOrder[]) => {
    if (!orders.length) return null;
    return simulateRebalanceWhatIfV0({
      cashStart: toFiniteNumber(portfolioCash) ?? 0,
      valuesBySymbol: whatIfValuesBySymbol,
      targetWeightsBySymbol: whatIfTargetWeightsPostBySymbol,
      orders: orders
        .filter((o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0)
        .map((o) => ({ symbol: o.symbol, side: o.side as 'BUY' | 'SELL', notional: o.notional })),
      feeBps: whatIfFeeBps,
      slippageBps: whatIfSlippageBpsUsed,
      labelsBySymbol: whatIfLabelsBySymbol,
    });
  }, [portfolioCash, whatIfFeeBps, whatIfLabelsBySymbol, whatIfSlippageBpsUsed, whatIfTargetWeightsPostBySymbol, whatIfValuesBySymbol]);

  const preflightPreviewOrders = useMemo(() => previewOrdersForOpts(!!preflightPendingOpts?.cashSweep), [previewOrdersForOpts, preflightPendingOpts?.cashSweep]);
  const preflightPreviewWhatIf = useMemo(() => buildPreviewWhatIf(preflightPreviewOrders), [buildPreviewWhatIf, preflightPreviewOrders]);
  const safetyStopPreviewOrders = useMemo(() => previewOrdersForOpts(!!safetyStopPendingOpts?.cashSweep), [previewOrdersForOpts, safetyStopPendingOpts?.cashSweep]);
  const safetyStopPreviewWhatIf = useMemo(() => buildPreviewWhatIf(safetyStopPreviewOrders), [buildPreviewWhatIf, safetyStopPreviewOrders]);

  const closePreflightAndJump = useCallback((id: string) => {
    setPreflightOpen(false);
    setTimeout(() => scrollToId(id), 0);
  }, []);

  const closePreflight = useCallback(() => {
    setPreflightOpen(false);
    setPreflightPendingOpts(null);
  }, []);

  const closeSafetyStop = useCallback(() => {
    setSafetyStopOpen(false);
    setSafetyStopPendingOpts(null);
  }, []);

  const safetyStopDisableDynamicScheduleV0 = useCallback(() => {
    try {
      const st = loadRebalanceScheduleStateV1();
      if (st.schedule.enabled) persistRebalanceScheduleV1({ ...st.schedule, enabled: false });
    } catch {
      // ignore
    }
    closeSafetyStop();
  }, [closeSafetyStop]);

  const openPreflightForRun = useCallback((opts?: RunOpts) => {
    const hasPriceWarnings = priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0;
    const hasConstraintAlerts = preRunHasBlockingV0 || preRunHasWarningsV0;
    setPreflightPendingOpts(opts ?? {});
    setPreflightAckPrices(!hasPriceWarnings);
    setPreflightAckConstraints(!hasConstraintAlerts);
    setPreflightAckCash(false);
    setPreflightOverrideBlockers(false);
    setPreflightOpen(true);
  }, [preRunHasBlockingV0, preRunHasWarningsV0, priceDataWarningsV0.lastClose.length, priceDataWarningsV0.missing.length]);

  const runPaperRebalanceCore = useCallback(async (opts?: RunOpts) => {
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
            phase: 'executing',
          });
        }
      }
    }

    const mode: ExecutionModeV0 = executionModeNormalized;
    setPaperRunExecutionMode(mode);
    if (mode === 'live') {
      setPaperRunError('Live execution is not configured yet. Please switch to Dry run.');
      persistExecutionModeV0('paper');
      setPaperRunExecutionMode('paper');
      return;
    }
    if (preTradeCashCheck.blocking) {
      setPaperRunError(preTradeCashCheck.message);
      return;
    }
    if (liquiditySettlementGateV0.blocked) {
      setPaperRunError(liquiditySettlementGateV0.message);
      return;
    }

    const startedStatus = startRebalanceOrderStatusRunV0({
      storage: window.localStorage,
      message: opts?.cashSweep ? `Funds hub cash sweep (${mode})` : `Funds hub rebalance (${mode})`,
    });
    if (startedStatus.ok) statusRunId = startedStatus.run.runId;
    setPaperRunLoading(true);
    paperRunAbortRef.current?.abort();
    const controller = new AbortController();
    paperRunAbortRef.current = controller;
    setPaperRunDriftAlert(
      computeDriftAlertFromTableRows({ at: new Date().toISOString(), rows: rebalanceTableRows, thresholdPct: opts?.cashSweep ? 0 : driftThresholdPct }),
    );

    try {
      const st = loadPortfolioStateV1();
      const mp: any = moneyPlan as any;
      const baseCcy = typeof mp?.account?.baseCcy === 'string' ? String(mp.account.baseCcy) : '';
      const constraints = buildRunConstraintsV0(mp, assetBlacklistV0);
      const holdingsMap = buildRunHoldingsMapV0((st as any).positions, assetBlacklistSetV0);
      const pricesMap = buildPricesMapV0({
        funds,
        priceSnapshot,
        holdingsMap,
        targetWeightsInput: targetWeightsEffective,
      });
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
        thresholdPct: thresholdPctForRun,
        lastRebalanceAt: st.lastRebalance?.at,
        now: new Date().toISOString(),
        ...(opts?.cashSweep ? { cashSweepToTarget: true } : {}),
      };
      const account: any = { cash: st.cash };
      if (baseCcy) account.baseCcy = baseCcy;
      const req = { account, constraints, policy, holdings: holdingsMap, prices: pricesMap, targetWeights: targetWeightsEffective };
      const expectedOrdersForRun = opts?.cashSweep
        ? (() => {
            try {
              return normalizeOrders(rebalanceCore(req).orders);
            } catch {
              return effectiveOrders;
            }
          })()
        : effectiveOrders;
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
            pricesBySymbol: pricesMap,
          });
        } catch {
          return null;
        }
      })();

      saveJsonToLs(LS_REBALANCE_REQUEST, req);
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
        const v: any = parsed.ok ? (respValue as any) : null;
        const serverErr = v && typeof v === 'object' ? (typeof v.error === 'string' ? String(v.error) : null) : null;
        const expected = v && typeof v === 'object' ? (typeof v.expected === 'string' ? String(v.expected) : null) : null;
        const msgBase = serverErr ? `Core error: ${serverErr}` : 'Core request failed';
        const msg = `${msgBase} (HTTP ${res.status})${expected ? `; expected: ${expected}` : ''}`;
        setPaperRunError(msg);
        setPaperRunFailureDetails((parsed.ok ? pretty(v) : text).slice(0, 8000));
        if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: msg, message: 'core request failed' });
        return;
      }
      if (!parsed.ok) {
        const snippet = text ? text.slice(0, 240) : '';
        const msg = `Core response JSON parse failed (HTTP ${res.status})${snippet ? `; body: ${snippet}` : ''}`;
        setPaperRunError(msg);
        setPaperRunFailureDetails(text.slice(0, 8000));
        if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: msg, message: 'core response parse failed' });
        return;
      }

      const resp: any = respValue as any;
      setPaperRunDriftAlert(computeDriftAlertFromCoreResponse({ at: new Date().toISOString(), resp, fallbackThresholdPct: thresholdPctForRun }));
      const shouldRebalance = !!resp?.trigger?.shouldRebalance;
      const orders = shouldRebalance ? normalizeOrders(resp?.orders) : [];
      const runNote = opts?.cashSweep ? 'ui:market/funds:cash-sweep' : 'ui:market/funds:dry-run';

      if (!shouldRebalance) {
        setPaperRunSummary('触发策略: shouldRebalance=false（no-op；orders=0，展示预期 allocations）。');
        setPaperRunRecordedAt(new Date().toISOString());
        if (statusRunId) finishRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, phase: 'done', message: 'shouldRebalance=false (no-op)' });
        try {
          appendRebalanceLog({ storage: window.localStorage, source: 'core', runId: statusRunId ?? undefined, request: req, response: respValue, note: runNote });
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
          baseCcy: baseCcy || null,
        });
        if (coreCashCheck.blocking) {
          setPaperRunError(coreCashCheck.message);
          if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: coreCashCheck.message, message: 'pre-trade cash check blocked' });
          return;
        }

        if (statusRunId) {
          attachOrdersToRebalanceRunV0({ storage: window.localStorage, runId: statusRunId, orders, message: `executing ${orders.length} orders (paper)` });
          for (let i = 0; i < orders.length; i++) {
            const orderId = String(i + 1);
            updateRebalanceOrderStatusV0({ storage: window.localStorage, runId: statusRunId, orderId, status: 'submitted', filledNotional: 0, fillPct01: 0, detail: 'submitted (paper broker)', phase: 'executing' });
          }
        }

        const exec = getExecutionAdapterV0('paper');
        const r = exec.executeOrders({ storage: window.localStorage, source: 'rebalance-core', runId: statusRunId ?? undefined, orders, note: runNote });
        if (!r.ok) {
          setPaperRunError(r.error);
          if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: r.error, message: 'paper execution log failed' });
          return;
        }
        if (r.kind !== 'paper') {
          setPaperRunError('paper execution adapter returned unexpected result');
          if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: 'unexpected execution adapter result', message: 'paper execution adapter mismatch' });
          return;
        }
        if (statusRunId) {
          await simulatePaperBrokerFillProgressV0({ storage: window.localStorage, runId: statusRunId, orders: orders as any, signal: controller.signal });
          finishRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, phase: 'recorded', message: `recorded ${orders.length} paper orders (simulated broker fills)` });
        }
        setPaperRunRecordedAt(r.entry.at);
        setPaperRunSummary(`已记录 Dry run（不发送真实订单）：${orders.length} 条 orders。`);
        try {
          pushDynamicRebalanceNotificationV0({ storage: window.localStorage, atIso: r.entry.at, kind: 'run-recorded', title: 'Dynamic rebalance recorded', body: `Recorded ${orders.length} paper orders (${opts?.cashSweep ? 'cash sweep' : 'dry run'}).` });
        } catch {
          // ignore
        }
      }

      const actualSummary: RebalancePostRunSummaryV0 | null = (() => {
        try {
          const targetWeightsBySymbol: Record<string, number> = {};
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
            pricesBySymbol: pricesMap,
          });
        } catch {
          return null;
        }
      })();

      if (actualSummary) setPaperRunPostSummary(actualSummary);
      const notes: string[] = [];
      let pass: boolean | null = null;
      if (!expectedSummary) notes.push('missing expected (preview) metrics');
      if (!actualSummary) notes.push('missing actual (core) metrics');
      if (expectedSummary && actualSummary) {
        const turnoverDiff = Math.abs(actualSummary.turnoverNotional - expectedSummary.turnoverNotional);
        const turnoverTol = Math.max(1, Math.abs(expectedSummary.turnoverNotional) * 0.01);
        const driftExp = expectedSummary.maxAbsDriftAfterPct01;
        const driftAct = actualSummary.maxAbsDriftAfterPct01;
        const driftDiff = driftExp !== null && driftAct !== null ? Math.abs(driftAct - driftExp) : Number.POSITIVE_INFINITY;
        const driftTol = 0.001;
        pass = turnoverDiff <= turnoverTol && driftDiff <= driftTol;
        if (turnoverDiff > turnoverTol) notes.push(`turnover mismatch: diff=${turnoverDiff.toFixed(2)} > tol=${turnoverTol.toFixed(2)}`);
        if (driftDiff > driftTol) notes.push(`post-drift mismatch: diff=${fmtPct01(driftDiff)} > tol=${fmtPct01(driftTol)}`);
        if (expectedSummary.ordersCount !== actualSummary.ordersCount) notes.push(`ordersCount mismatch: expected=${expectedSummary.ordersCount} vs actual=${actualSummary.ordersCount}`);
      }
      setPaperRunHealthcheck({ expected: expectedSummary, actual: actualSummary, pass, notes });
      if (shouldRebalance && orders.length) {
        recordPortfolioLastRebalance({ kind: 'core', runId: statusRunId ?? undefined, request: req, response: respValue, logNote: runNote });
      }
    } catch (e) {
      const isAbort = typeof e === 'object' && e !== null && 'name' in e && (e as any).name === 'AbortError';
      if (isAbort) {
        setPaperRunSummary('已取消（abort）。');
        if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: 'aborted', message: 'user aborted run' });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setPaperRunError(msg);
        if (statusRunId) failRebalanceOrderStatusRunV0({ storage: window.localStorage, runId: statusRunId, error: msg, message: 'run failed' });
      }
    } finally {
      paperRunAbortRef.current = null;
      setPaperRunLoading(false);
    }
  }, [assetBlacklistSetV0, assetBlacklistV0, driftThresholdPct, effectiveOrders, executionModeNormalized, funds, liquiditySettlementGateV0.blocked, liquiditySettlementGateV0.message, moneyPlan, preTradeCashCheck.blocking, preTradeCashCheck.message, priceSnapshot, rebalanceTableRows, sellProceedsRoutingV0, targetWeightsEffective, whatIfFeeBps, whatIfLabelsBySymbol, whatIfSlippageBpsUsed, whatIfTargetWeightsPostBySymbol]);

  const proceedFromPreflight = useCallback(async () => {
    const pending = preflightPendingOpts;
    closePreflight();
    if (!pending) return;
    setSafetyStopPendingOpts(pending);
    setSafetyStopOpen(true);
  }, [closePreflight, preflightPendingOpts]);

  const proceedFromSafetyStop = useCallback(async () => {
    const pending = safetyStopPendingOpts;
    closeSafetyStop();
    setPaperRunLastConfirmedOpts(pending ?? {});
    if (pending && pending.cashSweep) return runPaperRebalanceCore({ cashSweep: true });
    return runPaperRebalanceCore();
  }, [closeSafetyStop, runPaperRebalanceCore, safetyStopPendingOpts]);

  const cancelRun = useCallback(() => {
    paperRunAbortRef.current?.abort();
  }, []);

  return {
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
  };
}
