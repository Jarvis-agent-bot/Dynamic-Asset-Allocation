import AllocationDiffChartV0 from './AllocationDiffChartV0';
import { fmtPct01 } from './DaaRebalancePanel.helpersV0';

type SlippageSensitivityV0 = 'LOW' | 'BASE' | 'HIGH';

const SLIPPAGE_SENSITIVITY_MULTIPLIER_V0: Record<SlippageSensitivityV0, number> = {
  LOW: 0.5,
  BASE: 1,
  HIGH: 2,
};

type Props = {
  whatIf: any;
  baseCcy: string | null;
  effectiveOrders: any[];
  whatIfRows: any[];
  whatIfFeeBps: number;
  setWhatIfFeeBps: (value: number) => void;
  whatIfSlippageBps: number;
  setWhatIfSlippageBps: (value: number) => void;
  whatIfSlippageSensitivityV0: SlippageSensitivityV0;
  setWhatIfSlippageSensitivityV0: (value: SlippageSensitivityV0) => void;
  whatIfSlippageBpsUsed: number;
  whatIfAllocationDiffRowsV0: any[];
  driftThresholdPct: number;
  taxLotsImpactV0: any;
};

export default function DaaRebalanceWhatIfSectionV0(props: Props) {
  const {
    whatIf,
    baseCcy,
    effectiveOrders,
    whatIfRows,
    whatIfFeeBps,
    setWhatIfFeeBps,
    whatIfSlippageBps,
    setWhatIfSlippageBps,
    whatIfSlippageSensitivityV0,
    setWhatIfSlippageSensitivityV0,
    whatIfSlippageBpsUsed,
    whatIfAllocationDiffRowsV0,
    driftThresholdPct,
    taxLotsImpactV0,
  } = props;

  return (
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
          background: 'rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12 }}>Impact summary (preview)</div>
        {(() => {
          const ccy = baseCcy ? ` ${baseCcy}` : '';
          const trades = effectiveOrders.filter(
            (o) => o && o.symbol && (o.side === 'BUY' || o.side === 'SELL') && Number.isFinite(o.notional) && o.notional > 0,
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
                <div className="muted" style={{ fontSize: 11 }}>
                  trades
                </div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{trades}</div>
              </div>
              <div style={{ minWidth: 220 }}>
                <div className="muted" style={{ fontSize: 11 }}>
                  turnover
                </div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  {whatIf.turnoverNotional.toFixed(2)}
                  {ccy}
                  {turnoverPct01 !== null ? ` (${fmtPct01(turnoverPct01)})` : ''}
                </div>
              </div>
              <div style={{ minWidth: 200 }}>
                <div className="muted" style={{ fontSize: 11 }}>
                  max|drift| after
                </div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{maxAbsDriftAfterPct01 !== null ? fmtPct01(maxAbsDriftAfterPct01) : 'n/a'}</div>
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
          background: 'rgba(0,0,0,0.12)',
        }}
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
              Estimated fee range≈<b>{(feeBase * 0.85).toFixed(2)}</b>~<b>{(feeBase * 1.15).toFixed(2)}</b>
              {ccy} · slippage range≈<b>{(slipBase * 0.75).toFixed(2)}</b>~<b>{(slipBase * 1.35).toFixed(2)}</b>
              {ccy} · total execution cost≈<b>{low.toFixed(2)}</b>~<b>{high.toFixed(2)}</b>
              {ccy}
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
          background: 'rgba(0,0,0,0.12)',
        }}
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
          background: 'rgba(0,0,0,0.12)',
        }}
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
                cashDelta={cashDelta.toFixed(2)}
                {ccy}
                {cashDeltaPct !== null ? ` (${(cashDeltaPct * 100).toFixed(2)}%)` : ''}
                <span className="muted"> = cashAfter - cashBefore</span>
              </div>
              <details className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                <summary style={{ cursor: 'pointer' }}>Details</summary>
                <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                  sellGross={sellGross.toFixed(2)}{ccy}; sellCost≈{whatIf.costSellTotal.toFixed(2)}{ccy}; buyCost≈{whatIf.costBuyTotal.toFixed(2)}{ccy}.{' '}
                  <span className="muted">Check: cashAfter ≈ cashBefore + sellNet - buy</span>
                  {!cashEqOk ? <span style={{ color: 'var(--danger)' }}> (mismatch; check inputs)</span> : null}
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
            background: 'rgba(0,0,0,0.12)',
          }}
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
                    {taxLotsImpactV0.rows.map((r: any, idx: number) => {
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
          <div className="muted" style={{ fontSize: 12 }}>sensitivity</div>
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
                  cursor: 'pointer',
                }}
                title={`effectiveSlippageBps = base * ${mult}`}
              >
                {label}
              </button>
            );
          })}
          <div className="muted" style={{ fontSize: 12 }}>effective={whatIfSlippageBpsUsed.toFixed(1)} bps</div>
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
                <span className="muted"> = totalAfter - totalBefore</span>
              </div>
            </>
          );
        })()}
      </div>
      {whatIf.warnings.length ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{whatIf.warnings.join('; ')}</div> : null}
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
          buy={whatIf.buyNotional.toFixed(2)}; sell={whatIf.sellNotional.toFixed(2)}; totalBefore={whatIf.totalBefore.toFixed(2)}
          {baseCcy ? ` ${baseCcy}` : ''}; totalAfter={whatIf.totalAfter.toFixed(2)}
          {baseCcy ? ` ${baseCcy}` : ''}; cashAfter={whatIf.cashAfter.toFixed(2)}
          {baseCcy ? ` ${baseCcy}` : ''}.
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
  );
}
