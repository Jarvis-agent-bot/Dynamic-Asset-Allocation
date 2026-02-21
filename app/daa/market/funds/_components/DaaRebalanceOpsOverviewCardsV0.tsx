import Link from 'next/link';
import type { Dispatch, SetStateAction } from 'react';

type ViolationV0 = {
  level: 'blocker' | 'warning' | string;
  title: string;
  details?: string[];
};

type RebalanceRowV0 = {
  id: string;
  deltaPct: number;
};

type WarningItemV0 = string | { sym?: string; label?: string };
type PriceWarningsV0 = {
  missing: WarningItemV0[];
  lastClose: WarningItemV0[];
};

type Props = {
  driftThresholdPct: number;
  scheduleEnabled: boolean;
  targetWeightsLength: number;
  priceDataWarnings: PriceWarningsV0;
  preRunViolations: ViolationV0[];
  preTradeCashCheck: { blocking: boolean; message: string };
  rebalanceTableRows: RebalanceRowV0[];
  smartDefaultsHints: string[];
  detectionReviewState: Record<string, 'approved' | 'rejected'>;
  setDetectionReviewState: Dispatch<SetStateAction<Record<string, 'approved' | 'rejected'>>>;
  jumpTo: (id: string) => void;
  openPreflightForRun: () => void;
  onApplySmartDefaults: () => void;
};

export default function DaaRebalanceOpsOverviewCardsV0({
  driftThresholdPct,
  scheduleEnabled,
  targetWeightsLength,
  priceDataWarnings,
  preRunViolations,
  preTradeCashCheck,
  rebalanceTableRows,
  smartDefaultsHints,
  detectionReviewState,
  setDetectionReviewState,
  jumpTo,
  openPreflightForRun,
  onApplySmartDefaults,
}: Props) {
  const missingTargets = targetWeightsLength === 0;
  const hasPriceWarnings = priceDataWarnings.missing.length > 0 || priceDataWarnings.lastClose.length > 0;
  const blockers = preRunViolations.filter((v) => v.level === 'blocker');
  const warnings = preRunViolations.filter((v) => v.level === 'warning');
  const cashBlocked = !!preTradeCashCheck.blocking;
  const hasBlockingIssues = missingTargets || cashBlocked || blockers.length > 0;
  const hasAnyIssues = hasBlockingIssues || hasPriceWarnings || warnings.length > 0;

  const checks = [
    { label: 'Target weights configured', ok: targetWeightsLength > 0 },
    { label: 'Price inputs usable', ok: priceDataWarnings.missing.length === 0 },
    { label: 'Cash/settlement clear', ok: !preTradeCashCheck.blocking },
    { label: 'No checklist blockers', ok: blockers.length === 0 },
  ];
  const readyCount = checks.filter((c) => c.ok).length;
  const scorePct = Math.round((readyCount / checks.length) * 100);

  const detections: Array<{ id: string; label: string; detail: string }> = [];
  if (!targetWeightsLength) {
    detections.push({ id: 'missing-targets', label: 'Missing target weights', detail: 'Configure target weights before execution.' });
  }
  if (preTradeCashCheck.blocking) {
    detections.push({ id: 'cash-blocked', label: 'Cash/settlement blocker', detail: preTradeCashCheck.message });
  }
  if (hasPriceWarnings) {
    detections.push({
      id: 'price-warnings',
      label: 'Price data warnings',
      detail: `missing=${priceDataWarnings.missing.length}; lastCloseFallback=${priceDataWarnings.lastClose.length}`,
    });
  }
  for (const v of preRunViolations.slice(0, 3)) {
    const detail = Array.isArray(v.details) ? v.details.join(' ') : '';
    detections.push({ id: `violation-${v.level}-${v.title}`, label: `${v.level.toUpperCase()}: ${v.title}`, detail });
  }

  const urgent = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).slice(0, 5);
  const medium = rebalanceTableRows
    .filter((r) => Math.abs(r.deltaPct) >= driftThresholdPct && Math.abs(r.deltaPct) < Math.max(driftThresholdPct * 1.5, 0.03))
    .slice(0, 5);
  const warningSymbols = Array.from(
    new Set(
      [...(priceDataWarnings.missing ?? []), ...(priceDataWarnings.lastClose ?? [])]
        .map((x) => (typeof x === 'string' ? x : String(x?.sym ?? x?.label ?? '').trim()))
        .filter(Boolean),
    ),
  ).slice(0, 6);

  const ui = hasBlockingIssues
    ? {
        border: 'rgba(239, 68, 68, 0.55)',
        bg: 'rgba(239, 68, 68, 0.08)',
        title: 'var(--danger)',
      }
    : {
        border: 'rgba(245, 158, 11, 0.55)',
        bg: 'rgba(245, 158, 11, 0.08)',
        title: '#f59e0b',
      };
  const title = scheduleEnabled ? 'Dynamic rebalance preflight' : 'Preflight checks';
  const subtitle = scheduleEnabled ? 'Schedule is enabled. Fix these before the next run.' : 'Fix these before running a rebalance.';
  const nextAction = missingTargets
    ? { label: 'Next action: Set target weights', button: 'Open target weights', onClick: () => jumpTo('target-weights') }
    : hasPriceWarnings
      ? { label: 'Next action: Resolve price warnings', button: 'Open prices', onClick: () => jumpTo('prices') }
      : cashBlocked
        ? { label: 'Next action: Resolve cash blocker', button: 'Review cash routing', onClick: () => jumpTo('rebalance') }
        : blockers.length
          ? { label: 'Next action: Resolve checklist blockers', button: 'Review blockers', onClick: () => jumpTo('rebalance') }
          : { label: 'Next action: Review warnings then run preflight', button: 'Open preflight checklist', onClick: openPreflightForRun };

  return (
    <>
      {hasAnyIssues ? (
        <div
          role="alert"
          aria-label="Preflight issues"
          style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.bg, fontSize: 12 }}
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
                <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="button secondary" onClick={() => jumpTo('target-weights')} style={{ padding: '4px 8px' }}>Set target weights</button>
                  <Link href="/daa/dashboard?tab=wizard&step=4" className="muted" style={{ fontSize: 11 }}>Open Step4 recommendation</Link>
                </span>
              </div>
            ) : null}
            {hasPriceWarnings ? (
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                - Price data warnings: missing={priceDataWarnings.missing.length}; lastCloseFallback={priceDataWarnings.lastClose.length}.
                <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="button secondary" onClick={() => jumpTo('prices')} style={{ padding: '4px 8px' }}>Update prices</button>
                  <Link href="/daa/dashboard?tab=wizard&step=2" className="muted" style={{ fontSize: 11 }}>Open Step2 market events</Link>
                </span>
              </div>
            ) : null}
            {cashBlocked ? (
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                - Cash/settlement BLOCKED: <span style={{ color: 'var(--danger)' }}>{preTradeCashCheck.message}</span>
              </div>
            ) : null}
            {blockers.length ? (
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                - Constraints/validation BLOCKERS: {blockers.length}. <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{blockers.slice(0, 2).map((x) => x.title).join('; ')}</span>
              </div>
            ) : null}
            {!blockers.length && warnings.length ? (
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                - Constraints/validation warnings: {warnings.length}. <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{warnings.slice(0, 2).map((x) => x.title).join('; ')}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Step readiness scorecard</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Shows blockers before execution.</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          readiness score: <b style={{ color: scorePct >= 75 ? '#16a34a' : scorePct >= 50 ? '#f59e0b' : 'var(--danger)' }}>{scorePct}%</b> ({readyCount}/{checks.length})
        </div>
      </div>
      {detections.length ? (
        <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Inline detection review workspace</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {detections.map((d) => {
              const state = detectionReviewState[d.id] ?? null;
              return (
                <div key={d.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{d.label}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{d.detail}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    <button type="button" className={state === 'approved' ? 'button' : 'button secondary'} style={{ padding: '4px 8px' }} onClick={() => setDetectionReviewState((prev) => ({ ...prev, [d.id]: 'approved' }))}>Approve</button>
                    <button type="button" className={state === 'rejected' ? 'button' : 'button secondary'} style={{ padding: '4px 8px' }} onClick={() => setDetectionReviewState((prev) => ({ ...prev, [d.id]: 'rejected' }))}>Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Funds hub smart defaults</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onApplySmartDefaults}>Apply smart defaults</button>
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>Open ready-to-run section</button>
        </div>
        {smartDefaultsHints.length ? (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {smartDefaultsHints.map((hint) => <div key={hint} className="muted" style={{ fontSize: 11 }}>- {hint}</div>)}
          </div>
        ) : null}
      </div>
      {urgent.length || medium.length || warningSymbols.length ? (
        <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Watchlist signal inbox</div>
          {urgent.length ? <div style={{ marginTop: 6, fontSize: 11 }}><b style={{ color: 'var(--danger)' }}>Urgent</b>: {urgent.map((r) => `${r.id} ${(r.deltaPct * 100).toFixed(1)}%`).join(' · ')}</div> : null}
          {medium.length ? <div style={{ marginTop: 4, fontSize: 11 }}><b style={{ color: '#f59e0b' }}>Medium</b>: {medium.map((r) => `${r.id} ${(r.deltaPct * 100).toFixed(1)}%`).join(' · ')}</div> : null}
          {warningSymbols.length ? <div style={{ marginTop: 4, fontSize: 11 }}><b className="muted">Price warnings</b>: {warningSymbols.join(', ')}</div> : null}
        </div>
      ) : null}
    </>
  );
}
