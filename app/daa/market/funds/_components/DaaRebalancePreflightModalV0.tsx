import { summarizeTradesForConfirmationV0 } from '@/src/daa/tradesSummaryV0';

type ViolationV0 = {
  level: string;
  kind: string;
  title: string;
  details: string[];
  suggestion?: string;
};

type OrderV0 = {
  symbol: string;
  side: string;
  notional: number;
};

type WhatIfV0 = {
  turnoverNotional?: number;
  costTotal?: number;
  feeTotal?: number;
  slippageTotal?: number;
  warnings?: string[];
};

type Props = {
  open: boolean;
  pendingOpts: { cashSweep?: boolean } | null;
  baseCcy: string | null;
  previewOrders: OrderV0[];
  previewWhatIf: WhatIfV0 | null;
  hasPriceWarnings: boolean;
  priceWarnings: { missing: unknown[]; lastClose: unknown[] };
  hasBlocking: boolean;
  hasWarnings: boolean;
  violations: ViolationV0[];
  preTradeCashCheck: { blocking: boolean; message: string };
  ackPrices: boolean;
  ackConstraints: boolean;
  ackCash: boolean;
  overrideBlockers: boolean;
  canProceed: boolean;
  loading: boolean;
  executionBlockReason: string | null | undefined;
  targetWeightsCount: number;
  onClose: () => void;
  onJump: (id: string) => void;
  onSetAckPrices: (v: boolean) => void;
  onSetAckConstraints: (v: boolean) => void;
  onSetAckCash: (v: boolean) => void;
  onSetOverrideBlockers: (v: boolean) => void;
  onProceed: () => void;
};

export default function DaaRebalancePreflightModalV0(props: Props) {
  if (!props.open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preflight checklist"
      onClick={props.onClose}
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
              Before <b>{props.pendingOpts?.cashSweep ? 'cash sweep' : 'running rebalance'}</b> (dry run).
            </div>
          </div>
          <button type="button" className="button secondary" onClick={props.onClose} style={{ padding: '6px 10px' }}>
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
            const ccy = props.baseCcy ? ` ${props.baseCcy}` : '';
            const s = summarizeTradesForConfirmationV0(props.previewOrders, { topN: 8 });
            const w = props.previewWhatIf;
            const bits: string[] = [];
            bits.push(`orders=${s.orderCount}`);
            bits.push(`trades=${s.tradeCount} (buy=${s.buyCount}; sell=${s.sellCount})`);
            if (Number.isFinite(s.buyNotional)) bits.push(`buy≈${s.buyNotional.toFixed(2)}${ccy}`);
            if (Number.isFinite(s.sellNotional)) bits.push(`sell≈${s.sellNotional.toFixed(2)}${ccy}`);
            if (Number.isFinite(s.netNotional)) bits.push(`net≈${s.netNotional.toFixed(2)}${ccy}`);
            const costTotal = w?.costTotal;
            if (Number.isFinite(costTotal)) bits.push(`cost≈${Number(costTotal).toFixed(2)}${ccy}`);
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
                {props.hasPriceWarnings
                  ? `Warnings: missing=${props.priceWarnings.missing.length}; lastCloseFallback=${props.priceWarnings.lastClose.length}`
                  : 'OK: all symbols have a usable price'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: props.hasPriceWarnings ? 'rgba(245, 158, 11, 0.20)' : 'rgba(34, 197, 94, 0.18)',
                  color: props.hasPriceWarnings ? '#f59e0b' : '#22c55e',
                  fontSize: 12,
                  whiteSpace: 'nowrap'}}
              >
                {props.hasPriceWarnings ? 'WARN' : 'OK'}
              </span>
              <button type="button" className="button secondary" onClick={() => props.onJump('prices')} style={{ padding: '6px 10px' }}>
                Review
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Constraints / validation</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {props.hasBlocking
                  ? `BLOCKERS detected (${props.violations.filter((v) => v.level === 'blocker').length})`
                  : props.hasWarnings
                    ? `Warnings detected (${props.violations.filter((v) => v.level === 'warning').length})`
                    : 'OK: no blockers/warnings'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: props.hasBlocking
                    ? 'rgba(239, 68, 68, 0.18)'
                    : props.hasWarnings
                      ? 'rgba(245, 158, 11, 0.20)'
                      : 'rgba(34, 197, 94, 0.18)',
                  color: props.hasBlocking ? '#ef4444' : props.hasWarnings ? '#f59e0b' : '#22c55e',
                  fontSize: 12,
                  whiteSpace: 'nowrap'}}
              >
                {props.hasBlocking ? 'BLOCKER' : props.hasWarnings ? 'WARN' : 'OK'}
              </span>
              <button type="button" className="button secondary" onClick={() => props.onJump('rebalance')} style={{ padding: '6px 10px' }}>
                Review
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Cash / settlement assumptions</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {props.preTradeCashCheck.blocking ? `BLOCKED: ${props.preTradeCashCheck.message}` : 'OK: pre-trade cash check passed'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: props.preTradeCashCheck.blocking ? 'rgba(239, 68, 68, 0.18)' : 'rgba(34, 197, 94, 0.18)',
                  color: props.preTradeCashCheck.blocking ? '#ef4444' : '#22c55e',
                  fontSize: 12,
                  whiteSpace: 'nowrap'}}
              >
                {props.preTradeCashCheck.blocking ? 'BLOCKED' : 'OK'}
              </span>
              <button type="button" className="button secondary" onClick={() => props.onJump('rebalance')} style={{ padding: '6px 10px' }}>
                Review
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{props.pendingOpts?.cashSweep ? 'Cash sweep preview' : 'Rebalance preview'}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {(() => {
                  const ccy = props.baseCcy ? ` ${props.baseCcy}` : '';
                  const w = props.previewWhatIf;
                  const n = props.previewOrders.length;
                  if (!n) return 'No eligible orders under current inputs.';
                  const bits: string[] = [];
                  bits.push(`orders=${n}`);
                  const turnoverNotional = w?.turnoverNotional;
                  const costTotal = w?.costTotal;
                  const feeTotal = w?.feeTotal;
                  const slippageTotal = w?.slippageTotal;
                  if (Number.isFinite(turnoverNotional)) bits.push(`turnover≈${Number(turnoverNotional).toFixed(2)}${ccy}`);
                  if (Number.isFinite(costTotal)) bits.push(`cost≈${Number(costTotal).toFixed(2)}${ccy}`);
                  if (Number.isFinite(feeTotal) && Number.isFinite(slippageTotal))
                    bits.push(`(fee≈${Number(feeTotal).toFixed(2)}${ccy}, slippage≈${Number(slippageTotal).toFixed(2)}${ccy})`);
                  return bits.join('; ');
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {(() => {
                const w = props.previewWhatIf;
                const n = props.previewOrders.length;
                const warn = (w?.warnings?.length ?? 0) > 0;
                const status = !n ? 'EMPTY' : warn ? 'WARN' : 'OK';
                const bg =
                  status === 'WARN'
                    ? 'rgba(245, 158, 11, 0.20)'
                    : status === 'EMPTY'
                      ? 'rgba(100, 116, 139, 0.12)'
                      : 'rgba(34, 197, 94, 0.18)';
                const color = status === 'WARN' ? '#f59e0b' : status === 'EMPTY' ? '#64748b' : '#22c55e';
                return (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: bg,
                      color,
                      fontSize: 12,
                      whiteSpace: 'nowrap'}}
                    title={warn ? (w?.warnings ?? []).slice(0, 4).join('; ') : undefined}
                  >
                    {status}
                  </span>
                );
              })()}
              <button type="button" className="button secondary" onClick={() => props.onJump('rebalance')} style={{ padding: '6px 10px' }}>
                Review
              </button>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Execution mode: <b>dry run (paper)</b>. Dry run records orders to local execution log only.
          </div>
        </div>
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Acknowledge</div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={props.ackPrices} onChange={(e) => props.onSetAckPrices(e.target.checked)} />
            <span className="muted" style={{ fontSize: 12 }}>
              I verified target weights + prices. I accept any missing-price exclusions and last-close fallbacks.
            </span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={props.ackConstraints} onChange={(e) => props.onSetAckConstraints(e.target.checked)} />
            <span className="muted" style={{ fontSize: 12 }}>
              I reviewed constraints/validation (blockers/warnings) and understand the risk.
            </span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={props.ackCash} onChange={(e) => props.onSetAckCash(e.target.checked)} />
            <span className="muted" style={{ fontSize: 12 }}>
              I reviewed cash/settlement assumptions (sell proceeds routing + cashAfter) before executing.
            </span>
          </label>
          {props.hasBlocking ? (
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={props.overrideBlockers} onChange={(e) => props.onSetOverrideBlockers(e.target.checked)} />
              <span style={{ fontSize: 12, color: 'var(--danger)' }}>Override blockers and proceed anyway (not recommended).</span>
            </label>
          ) : null}
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' as const }}>
          <button type="button" className="button secondary" onClick={props.onClose} style={{ padding: '6px 10px' }}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            onClick={props.onProceed}
            style={{ padding: '6px 10px' }}
            disabled={!props.canProceed || props.loading || !!props.executionBlockReason || !props.targetWeightsCount}
            title={
              props.executionBlockReason
                ? props.executionBlockReason
                : !props.canProceed
                  ? 'Please acknowledge the checklist first.'
                  : undefined
            }
          >
            {props.pendingOpts?.cashSweep ? 'Proceed & cash sweep' : 'Proceed & run rebalance'}
          </button>
        </div>
      </div>
    </div>
  );
}
