'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { loadPortfolioStateV1, recordPortfolioLastRebalance } from '../../../portfolioStateStore';
import { getSnapshotPrice, loadPriceSnapshotV1 } from '../../../priceSnapshotStore';

import { appendPaperExecutionLog } from '@/src/daa/executionLogStore';
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

export function DaaRebalancePanel({ funds, holdings }: Props) {
  const rt = useDaaRuntime();
  const { exportBundle } = useDaaWorkflowExportBundleV1();

  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyOrdersStatus, setCopyOrdersStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyWeightsStatus, setCopyWeightsStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [rev, setRev] = useState(0);

  const [paperRunLoading, setPaperRunLoading] = useState(false);
  const [paperRunError, setPaperRunError] = useState<string | null>(null);
  const [paperRunRecordedAt, setPaperRunRecordedAt] = useState<string | null>(null);
  const [paperRunSummary, setPaperRunSummary] = useState<string | null>(null);

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener('storage', onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener('storage', onData);
    };
  }, []);

  const moneyPlan = useMemo(() => readJsonFromLs(LS_MONEY_PLAN), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);

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

  const headline = useMemo(() => {
    const readyBits = [rt.marketEventCount ? 'events' : null, rt.hasRecommendation ? 'recommendation' : null, rt.hasHumanProfile ? 'human' : null].filter(Boolean);
    const readyText = readyBits.length ? readyBits.join(' + ') : 'empty';
    return `Next: ${rt.nextActionText} (data: ${readyText})`;
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

  const targetWeights = useMemo(() => normalizeTargetWeights({ response: rebalanceResp, moneyPlan }), [moneyPlan, rebalanceResp]);

  const engineOrders = useMemo(() => {
    if (!rebalanceResp || typeof rebalanceResp !== 'object') return [];
    const r: any = rebalanceResp as any;
    return normalizeOrders(r.orders);
  }, [rebalanceResp]);

  const currentWeights = useMemo(() => {
    if (!holdings) return [] as Array<{ id: string; label: string; value: number }>;

    const byCode = new Map<string, FundLike>();
    for (const f of funds ?? []) {
      const code = String(f?.code ?? '').trim();
      if (code) byCode.set(code, f);
    }

    const rows: Array<{ id: string; label: string; value: number }> = [];
    for (const [codeRaw, h] of Object.entries(holdings ?? {})) {
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
  }, [funds, holdings, priceSnapshot]);

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

  async function runPaperRebalanceCore() {
    setPaperRunError(null);
    setPaperRunRecordedAt(null);
    setPaperRunSummary(null);

    if (typeof window === 'undefined') return;

    setPaperRunLoading(true);

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

      const policy = {
        thresholdPct: 0.01,
        minTradeNotional: 10,
        cooldownSeconds: 10 * 60,
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
      const orders = Array.isArray(resp?.orders) ? resp.orders : [];
      const shouldRebalance = !!resp?.trigger?.shouldRebalance;

      if (!shouldRebalance) {
        setPaperRunSummary('Trigger policy: shouldRebalance=false (not recorded).');
        return;
      }

      if (!orders.length) {
        setPaperRunSummary('No orders returned (not recorded).');
        return;
      }

      const r = appendPaperExecutionLog({
        storage: window.localStorage,
        source: 'rebalance-core',
        orders,
        note: 'ui:market/funds:paper-run',
      });

      if (!r.ok) {
        setPaperRunError(r.error);
        return;
      }

      setPaperRunRecordedAt(r.entry.at);
      setPaperRunSummary(`Recorded paper execution: ${orders.length} orders.`);

      // Record the latest run in the portfolio store so cooldown debouncing can work.
      recordPortfolioLastRebalance({ kind: 'core', request: req, response: respValue });
    } catch (e) {
      setPaperRunError(e instanceof Error ? e.message : String(e));
    } finally {
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
                <button
                  type="button"
                  className="button secondary"
                  onClick={runPaperRebalanceCore}
                  style={{ padding: '6px 10px' }}
                  disabled={paperRunLoading || !targetWeights.length}
                >
                  {paperRunLoading ? 'Running...' : 'Run paper rebalance'}
                </button>
                <Link href="/daa?step=3" className="muted" style={{ fontSize: 12 }}>
                  Edit money plan
                </Link>
                <Link href="/daa?step=4" className="muted" style={{ fontSize: 12 }}>
                  Run recommendation
                </Link>
              </div>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Current = holdings × (manual price or estGsz/gsz/dwjz) + cash; Target = engine targetWeights or money_plan.allocations; Orders = engine orders or naive diff.
            </div>

            {portfolioLastRebalanceAt ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                portfolioState.lastRebalance.at:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{portfolioLastRebalanceAt}</span>
              </div>
            ) : null}

            {paperRunRecordedAt ? (
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--primary)' }}>Paper run recorded at {paperRunRecordedAt}.</div>
            ) : paperRunError ? (
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--danger)' }}>{paperRunError}</div>
            ) : paperRunSummary ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{paperRunSummary}</div>
            ) : null}

            {rebalanceTableRows.length ? (
              <div style={{ marginTop: 10, overflowX: 'auto' as const }}>
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
                    {rebalanceTableRows.map((r) => {
                      const delta = r.currentPct - r.targetPct;
                      const color = delta > 0.01 ? 'var(--danger)' : delta < -0.01 ? 'var(--primary)' : 'var(--text)';
                      return (
                        <tr key={r.id}>
                          <td style={{ padding: '6px 0' }}>
                            {r.label} <span className="muted">({r.id})</span>
                          </td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.currentPct * 100).toFixed(1)}%</td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.targetPct * 100).toFixed(1)}%</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color }}>{(r.deltaPct * 100).toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Not enough data yet. Add holdings in Market/Funds and configure a money plan (Step3) / run recommendation (Step4).
              </div>
            )}

            <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Suggested orders</div>
              {effectiveOrders.length ? (
                <div style={{ overflowX: 'auto' as const }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Symbol</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Side</th>
                        <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Notional</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveOrders.map((o, idx) => (
                        <tr key={`${o.symbol}-${idx}`}>
                          <td style={{ padding: '6px 0' }}>{o.symbol}</td>
                          <td style={{ padding: '6px 0' }}>{o.side}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>{o.notional.toFixed(2)}</td>
                          <td style={{ padding: '6px 0' }} className="muted">
                            {o.reason || (engineOrders.length ? '' : 'naive')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Source: {engineOrders.length ? 'engine orders (last run)' : 'naive diff orders'}.
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>No orders. (Run Step4 once or ensure current vs target data exists.)</div>
              )}
            </div>
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
              Step5 Explain: waiting for recommendation (run Step4 once).
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
