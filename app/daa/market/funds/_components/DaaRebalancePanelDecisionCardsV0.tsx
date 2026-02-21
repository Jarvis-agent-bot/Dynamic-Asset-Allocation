import { deriveScenarioRoutingV0 } from '@/src/daa/scenarioRoutingV0';

type RebalanceRowV0 = {
  id: string;
  deltaPct: number;
  targetPct: number;
};

type PriceWarningEntryV0 = { sym: string; price?: number };

type Props = {
  rebalanceTableRows: RebalanceRowV0[];
  priceDataWarningsV0: { missing: PriceWarningEntryV0[]; lastClose: PriceWarningEntryV0[] };
  driftThresholdPct: number;
  liquiditySettlementGateV0: {
    blocked: boolean;
    settlementLagDays: number;
    cashGap: number;
    estimatedBuys: number;
    estimatedSells: number;
    availableCash: number;
    settledLiquidityCoverage: number;
  };
  preTradeCashCheck: { blocking: boolean };
  baseCcy: string | null;
  jumpTo: (targetId: string) => void;
  openPreflightForRun: () => void;
};

export default function DaaRebalancePanelDecisionCardsV0({
  rebalanceTableRows,
  priceDataWarningsV0,
  driftThresholdPct,
  liquiditySettlementGateV0,
  preTradeCashCheck,
  baseCcy,
  jumpTo,
  openPreflightForRun,
}: Props) {
  return (
    <>
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
        const routing = deriveScenarioRoutingV0({
          highDriftCount,
          deepNegativeCount,
          missingPriceCount: priceDataWarningsV0.missing.length,
          staleCloseCount: priceDataWarningsV0.lastClose.length,
        });
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${routing.scenario === 'A' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: routing.scenario === 'A' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Rebalance scenario A/B gates</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Route execution by strong-hold vs value-trap decision gate.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              scenario <b>{routing.scenario}</b> · gate <b>{routing.gateLabel}</b> · decision <b>{routing.routeLabel}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              stress score = high drift {highDriftCount}×5 + missing prices {priceDataWarningsV0.missing.length}×8 + stale closes {priceDataWarningsV0.lastClose.length}×3 = {routing.stressScore}
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trigger reason: {routing.triggerReasons.length ? routing.triggerReasons.join(' + ') : 'none (scenario A)'}
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
    </>
  );
}
