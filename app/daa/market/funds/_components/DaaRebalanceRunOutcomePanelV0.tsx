import AllocationDiffChartV0 from './AllocationDiffChartV0';
import { fmtPct01 } from './DaaRebalancePanel.helpersV0';
import { scrollToId } from './DaaRebalancePanel.helpersV0';
import { type RebalancePostRunSummaryV0 } from '@/src/daa/rebalancePostRunSummary';

type PaperRunHealthcheckV0 = {
  expected: {
    turnoverNotional: number;
    turnoverPctOfTotalBefore01: number | null;
    maxAbsDriftAfterPct01: number | null;
  } | null;
  actual: {
    turnoverNotional: number;
    turnoverPctOfTotalBefore01: number | null;
    maxAbsDriftAfterPct01: number | null;
  } | null;
  notes: string[];
  pass: boolean | null;
};

type Props = {
  baseCcy: string | null;
  paperRunRecordedAt: string | null;
  paperRunExecutionMode: string;
  paperRunPostSummary: RebalancePostRunSummaryV0 | null;
  paperRunSummary: string | null;
  paperRunHealthcheck: PaperRunHealthcheckV0 | null;
  paperRunError: string | null;
  paperRunLoading: boolean;
  paperRunLastConfirmedOpts: { cashSweep?: boolean } | null;
  paperRunFailureDetails: string | null;
  onRetry: () => void;
  onReviewRetry: () => void;
  onRunGuidedRecovery: () => void;
  onJumpHistory: () => void;
};

export default function DaaRebalanceRunOutcomePanelV0({
  baseCcy,
  paperRunRecordedAt,
  paperRunExecutionMode,
  paperRunPostSummary,
  paperRunSummary,
  paperRunHealthcheck,
  paperRunError,
  paperRunLoading,
  paperRunLastConfirmedOpts,
  paperRunFailureDetails,
  onRetry,
  onReviewRetry,
  onRunGuidedRecovery,
  onJumpHistory,
}: Props) {
  if (paperRunRecordedAt) {
    return (
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
    );
  }

  if (paperRunError) {
    return (
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
              onClick={onRetry}
              title={!paperRunLastConfirmedOpts ? 'No confirmed run to retry yet.' : 'Retry the last confirmed run (same mode/options).'}
            >
              Retry
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ padding: '4px 8px' }}
              disabled={paperRunLoading}
              onClick={onReviewRetry}
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
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onJumpHistory}>
                Open history/audit
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onRunGuidedRecovery}>
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
    );
  }

  if (paperRunSummary) {
    return <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{paperRunSummary}</div>;
  }

  return null;
}
