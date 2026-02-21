'use client';

import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';
import { OrdersReviewV0 } from '../../../_components/OrdersReviewV0';
import { summarizeTradesForConfirmationV0 } from '@/src/daa/tradesSummaryV0';
import { toFiniteNumber } from './DaaRebalancePanel.helpersV0';

type SafetyStopPreviewOrder = {
  symbol: string;
  side: string;
  notional: number;
  reason?: string;
};

type PreRunViolation = {
  kind: string;
  level: string;
  title: string;
  details: string[];
  suggestion?: string;
};

type Props = {
  open: boolean;
  pendingCashSweep?: boolean;
  copyApprovalSummaryStatus: 'idle' | 'ok' | 'error';
  previewOrders: SafetyStopPreviewOrder[];
  previewWhatIf: {
    turnoverNotional: number;
    feeTotal: number;
    slippageTotal: number;
    costTotal: number;
  } | null;
  baseCcy: string | null;
  whatIfFeeBps: number;
  whatIfSlippageBps: number;
  whatIfSlippageBpsUsed: number;
  whatIfSlippageSensitivity: string;
  preRunViolations: PreRunViolation[];
  preTradeCashBlocking: boolean;
  preflightOverrideBlockers: boolean;
  portfolioCash: number;
  minTradeNotional: number;
  paperRunLoading: boolean;
  executionBlockReason?: string;
  targetWeightsCount: number;
  onCopyApprovalSummary: () => void;
  onClose: () => void;
  onSafetyStopDisableSchedule: () => void;
  onProceed: () => void;
};

export default function DaaSafetyStopModalV0({
  open,
  pendingCashSweep,
  copyApprovalSummaryStatus,
  previewOrders,
  previewWhatIf,
  baseCcy,
  whatIfFeeBps,
  whatIfSlippageBps,
  whatIfSlippageBpsUsed,
  whatIfSlippageSensitivity,
  preRunViolations,
  preTradeCashBlocking,
  preflightOverrideBlockers,
  portfolioCash,
  minTradeNotional,
  paperRunLoading,
  executionBlockReason,
  targetWeightsCount,
  onCopyApprovalSummary,
  onClose,
  onSafetyStopDisableSchedule,
  onProceed,
}: Props) {
  if (!open) return null;
  const scheduleEnabled = loadRebalanceScheduleStateV1().schedule.enabled;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Safety stop confirmation"
      onClick={() => onClose()}
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
              About to <b>{pendingCashSweep ? 'cash sweep' : 'execute dynamic rebalance'}</b> (dry run).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <button
              type="button"
              className="button secondary"
              onClick={onCopyApprovalSummary}
              style={{ padding: '6px 10px' }}
              disabled={!previewOrders.length}
              title={!previewOrders.length ? 'No orders to summarize yet.' : 'Copy a markdown approval summary (orders/costs/constraints).'}
            >
              {copyApprovalSummaryStatus === 'ok'
                ? 'Copied'
                : copyApprovalSummaryStatus === 'error'
                  ? 'Copy failed'
                  : 'Copy approval summary'}
            </button>
            <button type="button" className="button secondary" onClick={() => onClose()} style={{ padding: '6px 10px' }}>
              Close
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.10)' }}>
          {(() => {
            const ccy = baseCcy ? ` ${baseCcy}` : '';
            const s = summarizeTradesForConfirmationV0(previewOrders, { topN: 8 });
            const w = previewWhatIf;
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
                    Simulated price impact (v0): feeBps=<b>{feeBpsShown.toFixed(1)}</b>; slippage/impactBps=<b>{slippageBpsBaseShown.toFixed(1)}</b> × sensitivity=<b>{whatIfSlippageSensitivity}</b> → effective=<b>{slippageBpsUsedShown.toFixed(1)}</b>. est fee≈<b>{feeTotal.toFixed(2)}</b>{ccy}; est impact≈<b>{impactTotal.toFixed(2)}</b>{ccy}; est total≈<b>{totalCost.toFixed(2)}</b>{ccy}.
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
            const blockers = preRunViolations.filter((v) => v.level === 'blocker');
            const warnings = preRunViolations.filter((v) => v.level === 'warning');
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: blockers.length ? 'var(--danger)' : warnings.length ? '#f59e0b' : 'var(--muted)' }}>
                  Constraints: {blockers.length ? `BLOCKERS=${blockers.length}` : 'ok'}
                  {warnings.length ? `; warnings=${warnings.length}` : ''}
                  {preTradeCashBlocking ? ' (cash/settlement BLOCKED)' : ''}
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
                      orders={(previewOrders ?? [])
                        .filter((o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0)
                        .map((o) => ({ symbol: o.symbol, side: o.side, notional: o.notional, reason: o.reason }))}
                      cashStart={toFiniteNumber(portfolioCash)}
                      minTradeNotional={minTradeNotional}
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
          <button type="button" className="button secondary" onClick={() => onClose()} style={{ padding: '6px 10px' }}>
            Cancel
          </button>
          <button
            type="button"
            className="button danger"
            onClick={() => onSafetyStopDisableSchedule()}
            style={{ padding: '6px 10px' }}
            disabled={!scheduleEnabled}
            title={
              scheduleEnabled
                ? 'Disable the local dynamic schedule and cancel this run.'
                : 'Schedule is already disabled.'
            }
          >
            Safety stop (disable schedule)
          </button>
          <button
            type="button"
            className="button"
            onClick={() => onProceed()}
            style={{ padding: '6px 10px' }}
            disabled={paperRunLoading || !!executionBlockReason || !targetWeightsCount}
            title={executionBlockReason}
          >
            {pendingCashSweep ? 'Execute cash sweep (dry run)' : 'Execute rebalance (dry run)'}
          </button>
        </div>
      </div>
    </div>
  );
}
