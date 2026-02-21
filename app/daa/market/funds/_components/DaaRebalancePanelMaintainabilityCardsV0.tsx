type RebalanceRowLike = {
  id?: string;
  deltaPct: number;
  targetPct: number;
  currentValue?: number;
  deltaValue?: number;
};

type EffectiveOrderLike = {
  symbol?: string;
  side?: string;
  notional?: number;
};

type Props = {
  baseCcy: string | null;
  driftThresholdPct: number;
  paperRunRecordedAt: string | null;
  paperRunError: string | null;
  paperRunLoading: boolean;
  preRunViolationsV0: Array<{ level: string }>;
  preTradeCashCheck: { blocking: boolean };
  priceDataWarningsV0: { missing: any[]; lastClose: any[] };
  rebalanceTableRows: RebalanceRowLike[];
  jumpTo: (id: string) => void;
  openPreflightForRun: (opts?: { cashSweep?: boolean }) => void;
  liquiditySettlementGateV0: {
    blocked: boolean;
    settlementLagDays: number;
    cashGap: number;
    estimatedBuys: number;
    estimatedSells: number;
    availableCash: number;
    settledLiquidityCoverage: number;
  };
  effectiveOrders: EffectiveOrderLike[];
  portfolioCash: number;
};

export default function DaaRebalancePanelMaintainabilityCardsV0({
  baseCcy,
  driftThresholdPct,
  paperRunRecordedAt,
  paperRunError,
  paperRunLoading,
  preRunViolationsV0,
  preTradeCashCheck,
  priceDataWarningsV0,
  rebalanceTableRows,
  jumpTo,
  openPreflightForRun,
  liquiditySettlementGateV0,
  effectiveOrders,
  portfolioCash,
}: Props) {
  return (
    <>
      <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Operator shift handover</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Summary for next shift continuity.</div>
        <div style={{ marginTop: 6, fontSize: 11 }}>
          last run={paperRunRecordedAt ? paperRunRecordedAt : 'none'} · runStatus={paperRunError ? 'failed' : paperRunLoading ? 'running' : 'idle'}
          {' '}· blockers={preRunViolationsV0.filter((v) => v.level === 'blocker').length}
          {' '}· warnings={preRunViolationsV0.filter((v) => v.level === 'warning').length}
        </div>
        <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
          next shift focus: {paperRunError ? 'use incident playbook and recover run' : preTradeCashCheck.blocking ? 'resolve cash/settlement blocker' : 'review preflight and run dry rebalance'}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('history-audit')}>
            Open history/audit
          </button>
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
            Open preflight checklist
          </button>
        </div>
      </div>
      {(() => {
        const rows = rebalanceTableRows.slice(0, 40);
        if (!rows.length) return null;
        const bucket = {
          A: { value: 0, drift: 0 },
          H: { value: 0, drift: 0 },
          US: { value: 0, drift: 0 },
          Other: { value: 0, drift: 0 },
        };
        for (const r of rows) {
          const id = String(r.id ?? '').trim();
          const vRaw = Number(r.currentValue ?? Number.NaN);
          const v = Number.isFinite(vRaw) ? vRaw : 0;
          const d = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const key = /^\d{6}$/.test(id) ? 'A' : /^HK/i.test(id) || /^0\d{4}$/.test(id) ? 'H' : /^[A-Z]{1,5}$/.test(id) ? 'US' : 'Other';
          bucket[key as 'A' | 'H' | 'US' | 'Other'].value += v;
          bucket[key as 'A' | 'H' | 'US' | 'Other'].drift = Math.max(bucket[key as 'A' | 'H' | 'US' | 'Other'].drift, d);
        }
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Cross-market ledger risk view</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Unified base-ccy exposure for A/H/US books.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {(['A', 'H', 'US', 'Other'] as const).map((k) => (
                <div key={k} style={{ fontSize: 11 }}>
                  {k}: exposure≈<b>{bucket[k].value.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''} · max|drift|≈<b>{(bucket[k].drift * 100).toFixed(2)}%</b>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const blockerCount = preRunViolationsV0.filter((v) => v.level === 'blocker').length;
        const warningCount = preRunViolationsV0.filter((v) => v.level === 'warning').length;
        const missingPriceCount = priceDataWarningsV0.missing.length;
        const stalePriceCount = priceDataWarningsV0.lastClose.length;
        const driftHotCount = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).length;
        const analystPenalty = missingPriceCount * 8 + stalePriceCount * 5 + Math.min(20, driftHotCount * 2);
        const managerPenalty = blockerCount * 18 + warningCount * 5 + (preTradeCashCheck.blocking ? 12 : 0) + (paperRunError ? 15 : 0);
        const analystScore = Math.max(0, 100 - analystPenalty);
        const managerScore = Math.max(0, 100 - managerPenalty);
        const tierOf = (score: number) => (score >= 80 ? 'elite' : score >= 50 ? 'neutral' : 'incompetent');
        const tierColor = (tier: 'elite' | 'neutral' | 'incompetent' | string) => (tier === 'elite' ? '#16a34a' : tier === 'neutral' ? '#f59e0b' : 'var(--danger)');
        const analystTier = tierOf(analystScore);
        const managerTier = tierOf(managerScore);
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Human-factor scoreboard</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Analyst/manager grades with transparent score breakdown.</div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Analyst</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>score <b>{analystScore}</b> · tier <b style={{ color: tierColor(analystTier) }}>{analystTier}</b></div>
                <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                  100 - ({missingPriceCount} missing×8 + {stalePriceCount} stale×5 + hot drift cap {Math.min(20, driftHotCount * 2)})
                </div>
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Manager</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>score <b>{managerScore}</b> · tier <b style={{ color: tierColor(managerTier) }}>{managerTier}</b></div>
                <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                  100 - ({blockerCount} blockers×18 + {warningCount} warnings×5 + cash block {preTradeCashCheck.blocking ? 12 : 0} + run error {paperRunError ? 15 : 0})
                </div>
              </div>
            </div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {[{ role: 'Analyst', tier: analystTier, score: analystScore }, { role: 'Manager', tier: managerTier, score: managerScore }].map((r) => (
                <div key={r.role} style={{ fontSize: 11 }}>
                  {r.role} tier-ladder: elite {'>='} 80, neutral 50-79, incompetent {'<'} 50 · current=<b style={{ color: tierColor(r.tier) }}>{r.tier}</b> ({r.score})
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 40);
        if (!rows.length) return null;
        const netDeltaNotional = rows.reduce((sum, r) => {
          const vRaw = Number(r.deltaValue ?? Number.NaN);
          const v = Number.isFinite(vRaw) ? vRaw : 0;
          return sum + v;
        }, 0);
        const highDriftCount = rows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).length;
        const envStressScore = highDriftCount * 6 + priceDataWarningsV0.missing.length * 10 + priceDataWarningsV0.lastClose.length * 4;
        const analystThesis = netDeltaNotional >= 0 ? 'risk-on' : 'risk-off';
        const regime = envStressScore >= 40 ? 'risk-off' : 'risk-on';
        const diverged = analystThesis !== regime;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${diverged ? 'var(--danger)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, background: diverged ? 'rgba(220,38,38,0.08)' : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Analyst logic-consistency alerts</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Flag divergence between analyst thesis and environment regime.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              thesis=<b>{analystThesis}</b> · regime=<b>{regime}</b> · status=<b style={{ color: diverged ? 'var(--danger)' : '#16a34a' }}>{diverged ? 'diverged' : 'aligned'}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              regime score = high drift {highDriftCount}×6 + missing prices {priceDataWarningsV0.missing.length}×10 + stale closes {priceDataWarningsV0.lastClose.length}×4 = {envStressScore}
            </div>
            {diverged ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('prices')}>
                  Recheck market regime inputs
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Rebalance thesis vs target weights
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 12);
        if (!rows.length) return null;
        const highDriftThreshold = Math.max(driftThresholdPct * 1.5, 0.03);
        const drifted = rows.filter((r) => Math.abs(r.deltaPct) >= highDriftThreshold);
        const downWeightFactor = 0.85;
        if (!drifted.length) {
          return (
            <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(34,197,94,0.45)', borderRadius: 12, background: 'rgba(22,163,74,0.08)' }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Thesis-regime drift control</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>No drift alert triggered; controlled down-weighting not required.</div>
            </div>
          );
        }
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 12, background: 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Thesis-regime drift alerts + controlled down-weighting</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Alert drifted symbols and apply a controlled down-weight factor.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {drifted.map((r) => {
                const base = Number.isFinite(r.targetPct) ? r.targetPct : 0;
                const adjusted = Math.max(0, base * downWeightFactor);
                return (
                  <div key={String(r.id ?? '')} style={{ fontSize: 11 }}>
                    {String(r.id ?? '')}: drift={(r.deltaPct * 100).toFixed(1)}% · W_base={(base * 100).toFixed(2)}% {'->'} W_controlled={(adjusted * 100).toFixed(2)}% (factor {downWeightFactor.toFixed(2)})
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Apply controlled down-weighting
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Re-route drifted recommendations
              </button>
            </div>
          </div>
        );
      })()}
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
        const stressScore = highDriftCount * 5 + priceDataWarningsV0.missing.length * 8 + priceDataWarningsV0.lastClose.length * 3;
        const scenario = stressScore >= 35 || deepNegativeCount >= 3 ? 'B' : 'A';
        const gateLabel = scenario === 'A' ? 'strong-hold gate' : 'value-trap gate';
        const routeLabel = scenario === 'A' ? 'route to normal rebalance execution' : 'route to defensive rebalance (trim/hedge first)';
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${scenario === 'A' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: scenario === 'A' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Rebalance scenario A/B gates</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Route execution by strong-hold vs value-trap decision gate.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              scenario <b>{scenario}</b> · gate <b>{gateLabel}</b> · decision <b>{routeLabel}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              stress score = high drift {highDriftCount}×5 + missing prices {priceDataWarningsV0.missing.length}×8 + stale closes {priceDataWarningsV0.lastClose.length}×3 = {stressScore}
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
    </>
  );
}
