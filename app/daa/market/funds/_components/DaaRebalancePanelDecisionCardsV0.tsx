import { useState } from 'react';
import { buildPriceWarningSymbolSetV0 } from '@/src/daa/priceWarningSymbolsV0';
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
  const [manualCheckpointConfirmed, setManualCheckpointConfirmed] = useState(false);
  const executionSuggestionLockTitle = manualCheckpointConfirmed
    ? undefined
    : 'Confirm manual checkpoint before applying execution suggestions.';

  return (
    <>
      {(() => {
        const rows = rebalanceTableRows.slice(0, 8);
        if (!rows.length) return null;
        const missingSet = buildPriceWarningSymbolSetV0(priceDataWarningsV0.missing);
        const staleSet = buildPriceWarningSymbolSetV0(priceDataWarningsV0.lastClose);
        const qatRows = rows.map((r) => {
          const id = String(r.id ?? '').trim();
          const driftAbs = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const driftGatePenalty = Math.min(0.35, driftAbs * 1.8);
          const missingGatePenalty = missingSet.has(id) ? 0.2 : 0;
          const staleGatePenalty = staleSet.has(id) ? 0.1 : 0;
          const quality = Math.max(0.6, 1 - driftGatePenalty - missingGatePenalty - staleGatePenalty);
          const wQat = Math.max(0, r.targetPct * quality);
          const gatePenaltyTotal = driftGatePenalty + missingGatePenalty + staleGatePenalty;
          const gatePenaltyTier = gatePenaltyTotal >= 0.35 ? 'heavy' : gatePenaltyTotal >= 0.2 ? 'medium' : 'light';
          const analystTierPreview = gatePenaltyTotal >= 0.35 ? 'incompetent' : gatePenaltyTotal >= 0.2 ? 'neutral' : 'elite';
          const analystTierMultiplier = analystTierPreview === 'elite' ? 1.05 : analystTierPreview === 'neutral' ? 1 : 0.85;
          return { id, targetPct: r.targetPct, quality, wQat, driftAbs, driftGatePenalty, missingGatePenalty, staleGatePenalty, gatePenaltyTotal, gatePenaltyTier, analystTierPreview, analystTierMultiplier };
        });
        const explainerExample = qatRows[0] ?? null;
        const gateLevelTraceTotals = qatRows.reduce(
          (acc, row) => {
            acc.drift += row.driftGatePenalty;
            acc.missing += row.missingGatePenalty;
            acc.stale += row.staleGatePenalty;
            acc.total += row.gatePenaltyTotal;
            return acc;
          },
          { drift: 0, missing: 0, stale: 0, total: 0 },
        );
        const gateLevelTraceAvg = {
          drift: gateLevelTraceTotals.drift / qatRows.length,
          missing: gateLevelTraceTotals.missing / qatRows.length,
          stale: gateLevelTraceTotals.stale / qatRows.length,
          total: gateLevelTraceTotals.total / qatRows.length,
        };
        const dominantGate = gateLevelTraceTotals.drift >= gateLevelTraceTotals.missing && gateLevelTraceTotals.drift >= gateLevelTraceTotals.stale
          ? 'drift'
          : gateLevelTraceTotals.missing >= gateLevelTraceTotals.stale
            ? 'missing'
            : 'stale';
        const dominantGateSharePct = gateLevelTraceTotals.total > 0
          ? ((dominantGate === 'drift' ? gateLevelTraceTotals.drift : dominantGate === 'missing' ? gateLevelTraceTotals.missing : gateLevelTraceTotals.stale) / gateLevelTraceTotals.total) * 100
          : 0;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>QAT weight-adjusted targets (W_qat)</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Operator-visible factor trace for quality-adjusted target weights.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {qatRows.map((r) => {
                const weightedPreview = r.wQat * r.analystTierMultiplier;
                const effectiveMultiplier = r.targetPct > 0 ? weightedPreview / r.targetPct : 0;
                const gatePenaltyShare = 1 - r.quality;
                const tierImpactDelta = weightedPreview - r.wQat;
                const tierImpactPct = r.wQat > 0 ? (tierImpactDelta / r.wQat) * 100 : 0;
                const tierImpactDirection = tierImpactDelta > 0 ? 'upweight' : tierImpactDelta < 0 ? 'downweight' : 'flat';
                const tierImpactBand = Math.abs(tierImpactPct) >= 20 ? 'aggressive' : Math.abs(tierImpactPct) >= 10 ? 'material' : Math.abs(tierImpactPct) > 0 ? 'light' : 'neutral';
                const traceConfidenceBand = effectiveMultiplier >= 0.95 ? 'strong' : effectiveMultiplier >= 0.8 ? 'moderate' : 'weak';
                return (
                  <div key={r.id} style={{ fontSize: 11 }}>
                    {r.id}: W_target={(r.targetPct * 100).toFixed(2)}% × Q={r.quality.toFixed(2)} (|drift|={(r.driftAbs * 100).toFixed(1)}%, missing={missingSet.has(r.id) ? 'yes' : 'no'}, stale={staleSet.has(r.id) ? 'yes' : 'no'}) {'=>'} W_qat=<b>{(r.wQat * 100).toFixed(2)}%</b> · gates(drift=-{(r.driftGatePenalty * 100).toFixed(1)}pp, missing=-{(r.missingGatePenalty * 100).toFixed(1)}pp, stale=-{(r.staleGatePenalty * 100).toFixed(1)}pp, total=-{(r.gatePenaltyTotal * 100).toFixed(1)}pp, tier=<b>{r.gatePenaltyTier}</b>, penalty-share=<b>{(gatePenaltyShare * 100).toFixed(1)}%</b>) · analyst-tier=<b>{r.analystTierPreview}</b> (x{r.analystTierMultiplier.toFixed(2)}) => preview weight=<b>{(weightedPreview * 100).toFixed(2)}%</b> · tier impact delta=<b>{(tierImpactDelta * 100).toFixed(2)}%</b> · tier impact ratio=<b>{tierImpactPct.toFixed(1)}%</b> · tier impact direction=<b>{tierImpactDirection}</b> · tier impact band=<b>{tierImpactBand}</b> · effective multiplier=<b>{effectiveMultiplier.toFixed(3)}</b> · confidence band=<b>{traceConfidenceBand}</b>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', fontSize: 11 }}>
              W_qat factor breakdown panel (gate-level trace)
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                avg gate penalties: drift=<b>{(gateLevelTraceAvg.drift * 100).toFixed(1)}pp</b> · missing=<b>{(gateLevelTraceAvg.missing * 100).toFixed(1)}pp</b> · stale=<b>{(gateLevelTraceAvg.stale * 100).toFixed(1)}pp</b> · total=<b>{(gateLevelTraceAvg.total * 100).toFixed(1)}pp</b>
              </div>
              <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                aggregate gate penalties: drift=<b>{(gateLevelTraceTotals.drift * 100).toFixed(1)}pp</b> · missing=<b>{(gateLevelTraceTotals.missing * 100).toFixed(1)}pp</b> · stale=<b>{(gateLevelTraceTotals.stale * 100).toFixed(1)}pp</b> · total=<b>{(gateLevelTraceTotals.total * 100).toFixed(1)}pp</b>
              </div>
              <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                dominant gate=<b>{dominantGate}</b> · dominant share=<b>{dominantGateSharePct.toFixed(1)}%</b>
              </div>
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, background: 'rgba(255,255,255,0.02)', fontSize: 11 }}>
              W_qat multiplier explainer: <b>W_qat = W_target × Q × analystTierMultiplier</b> where Q = 1 - driftPenalty - missingPenalty - stalePenalty.
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                Formula trace order: <b>1) derive Q</b> from gate penalties, <b>2) apply analyst tier multiplier</b>, <b>3) finalize recommendation preview weight</b>.
              </div>
              {explainerExample ? (
                <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                  Worked example ({explainerExample.id}): {(explainerExample.targetPct * 100).toFixed(2)}% × {explainerExample.quality.toFixed(2)} × {explainerExample.analystTierMultiplier.toFixed(2)} = {((explainerExample.targetPct * explainerExample.quality * explainerExample.analystTierMultiplier) * 100).toFixed(2)}% preview weight.
                </div>
              ) : null}
              {explainerExample ? (
                <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                  Formula contribution trace: quality drag=<b>{((1 - explainerExample.quality) * 100).toFixed(1)}pp</b> · tier lift=<b>{((explainerExample.analystTierMultiplier - 1) * 100).toFixed(1)}pp</b> · net multiplier=<b>{(explainerExample.quality * explainerExample.analystTierMultiplier).toFixed(3)}</b>
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', fontSize: 11 }}>
              W_qat formula evidence panel: avg quality=<b>{(qatRows.reduce((sum, row) => sum + row.quality, 0) / qatRows.length).toFixed(3)}</b> · avg analyst multiplier=<b>{(qatRows.reduce((sum, row) => sum + row.analystTierMultiplier, 0) / qatRows.length).toFixed(3)}</b> · avg net multiplier=<b>{(qatRows.reduce((sum, row) => sum + (row.quality * row.analystTierMultiplier), 0) / qatRows.length).toFixed(3)}</b>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                top formula evidence: <b>{explainerExample?.id || 'n/a'}</b> · quality=<b>{explainerExample ? explainerExample.quality.toFixed(2) : 'n/a'}</b> · analyst multiplier=<b>{explainerExample ? explainerExample.analystTierMultiplier.toFixed(2) : 'n/a'}</b> · recommendation=<b>{explainerExample && explainerExample.quality < 0.8 ? 'inspect gate penalties before trusting weight' : 'formula signal stable'}</b>
              </div>
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
        const policyGateStatus = routing.stressScore >= 40 ? 'tripped' : 'clear';
        const dataQualityGateStatus = priceDataWarningsV0.missing.length > 0 || priceDataWarningsV0.lastClose.length > 0 ? 'degraded' : 'clean';
        const deepNegativeGateStatus = deepNegativeCount >= 2 ? 'tripped' : 'clear';
        const bPathVotes = [
          routing.stressScore >= 40,
          deepNegativeCount >= 2,
          priceDataWarningsV0.missing.length > 0,
          priceDataWarningsV0.lastClose.length > 0,
        ].filter(Boolean).length;
        const aPathVotes = 4 - bPathVotes;
        const matrixConsensus = bPathVotes >= 2 ? 'B-path pressure' : 'A-path stable';
        const dominantGate = routing.stressScore >= 40
          ? 'policy-gate'
          : deepNegativeCount >= 2
            ? 'deep-negative-gate'
            : priceDataWarningsV0.missing.length > 0
              ? 'data-quality-missing-gate'
              : priceDataWarningsV0.lastClose.length > 0
                ? 'data-quality-stale-gate'
                : 'none';
        const consensusStrengthPct = Math.round((Math.max(aPathVotes, bPathVotes) / 4) * 100);
        const aGateSnapshot = routing.scenario === 'A' ? 'active' : 'standby';
        const bGateSnapshot = routing.scenario === 'B' ? 'active' : 'standby';
        const buyPathSnapshot = routing.buyPathBlocked ? 'blocked' : 'open';
        const gateSnapshotAlignment = routing.scenario === 'A'
          ? (routing.buyPathBlocked ? 'A-path mismatch (buy path blocked)' : 'A-path aligned')
          : (routing.buyPathBlocked ? 'B-path aligned' : 'B-path mismatch (buy path open)');
        const matrixConfidenceTier = consensusStrengthPct >= 75 && gateSnapshotAlignment.includes('aligned')
          ? 'high-confidence'
          : consensusStrengthPct >= 50
            ? 'medium-confidence'
            : 'low-confidence';
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${routing.scenario === 'A' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: routing.scenario === 'A' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Rebalance scenario A/B gates</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Route execution by strong-hold vs value-trap decision gate.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              scenario <b>{routing.scenario}</b> · gate <b>{routing.gateLabel}</b> · decision <b>{routing.routeLabel}</b>
            </div>
            <div style={{ marginTop: 4, fontSize: 11 }}>
              Scenario-routing evidence: policy-gate=<b>{policyGateStatus}</b> · data-quality-gate=<b>{dataQualityGateStatus}</b> · deep-negative-gate=<b>{deepNegativeGateStatus}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              stress score = high drift {highDriftCount}×5 + missing prices {priceDataWarningsV0.missing.length}×8 + stale closes {priceDataWarningsV0.lastClose.length}×3 = {routing.stressScore}
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trigger reason: {routing.triggerReasons.length ? routing.triggerReasons.join(' + ') : 'none (scenario A)'}
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              Scenario routing evidence matrix (A/B gate snapshot)
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              <div>policy-gate threshold(40): <b>{routing.stressScore >= 40 ? 'B path candidate' : 'A path candidate'}</b> (score {routing.stressScore})</div>
              <div>deep-negative gate threshold(2): <b>{deepNegativeCount >= 2 ? 'B path candidate' : 'A path candidate'}</b> (count {deepNegativeCount})</div>
              <div>data-quality gate threshold(missing>0): <b>{priceDataWarningsV0.missing.length > 0 ? 'B path candidate' : 'A path candidate'}</b> (missing {priceDataWarningsV0.missing.length})</div>
              <div>data-quality gate threshold(stale>0): <b>{priceDataWarningsV0.lastClose.length > 0 ? 'B path candidate' : 'A path candidate'}</b> (stale {priceDataWarningsV0.lastClose.length})</div>
              <div>evidence matrix votes: A=<b>{aPathVotes}</b> · B=<b>{bPathVotes}</b> · consensus=<b>{matrixConsensus}</b> · dominant gate=<b>{dominantGate}</b> · strength=<b>{consensusStrengthPct}%</b></div>
              <div>A/B gate snapshots: strong-hold=<b>{aGateSnapshot}</b> · value-trap=<b>{bGateSnapshot}</b> · buy-path=<b>{buyPathSnapshot}</b></div>
              <div>snapshot alignment verdict: <b>{gateSnapshotAlignment}</b></div>
              <div>routing confidence tier: <b>{matrixConfidenceTier}</b></div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Open scenario weight routing
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} title={executionSuggestionLockTitle} disabled={!manualCheckpointConfirmed} onClick={() => jumpTo('rebalance')}>
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
            <div style={{ marginTop: 6, fontSize: 11 }}>
              Buy gate precheck simulator (incompetence / MaxIn / liquidity / T+N)
            </div>
            {(() => {
              const precheckRows = rows.slice(0, 4).map((r) => {
                const id = String(r.id ?? '').trim();
                const incompetenceGate = Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 2.2, 0.06);
                const maxInGate = lockedIds.has(id);
                const liquidityGate = liquiditySettlementGateV0.blocked || preTradeCashCheck.blocking;
                const settlementGate = liquiditySettlementGateV0.settlementLagDays > 1;
                const blockedGateCount = [incompetenceGate, maxInGate, liquidityGate, settlementGate].filter(Boolean).length;
                const gateBlockScore = blockedGateCount / 4;
                const readinessPct = Math.round((1 - gateBlockScore) * 100);
                const verdict = blockedGateCount > 0 ? 'blocked' : 'ready';
                const primaryBlocker = incompetenceGate
                  ? 'incompetence'
                  : maxInGate
                    ? 'maxIn'
                    : liquidityGate
                      ? 'liquidity'
                      : settlementGate
                        ? 'T+N'
                        : 'none';
                const blockerSeverity = blockedGateCount >= 3 ? 'critical' : blockedGateCount === 2 ? 'high' : blockedGateCount === 1 ? 'medium' : 'none';
                const gateFingerprint = `${incompetenceGate ? 'I' : '-'}${maxInGate ? 'M' : '-'}${liquidityGate ? 'L' : '-'}${settlementGate ? 'T' : '-'}`;
                const unblockHint = primaryBlocker === 'incompetence'
                  ? 'reduce drift or reassess thesis'
                  : primaryBlocker === 'maxIn'
                    ? 'unlock MaxIn limit'
                    : primaryBlocker === 'liquidity'
                      ? 'raise cash or trim buy size'
                      : primaryBlocker === 'T+N'
                        ? 'wait for settlement window'
                        : 'ready to route';
                return {
                  id,
                  incompetenceGate,
                  maxInGate,
                  liquidityGate,
                  settlementGate,
                  blockedGateCount,
                  gateBlockScore,
                  readinessPct,
                  verdict,
                  primaryBlocker,
                  blockerSeverity,
                  gateFingerprint,
                  unblockHint,
                };
              });
              const evidencePanel = {
                blockedRows: precheckRows.filter((row) => row.verdict === 'blocked').length,
                incompetenceHits: precheckRows.filter((row) => row.incompetenceGate).length,
                maxInHits: precheckRows.filter((row) => row.maxInGate).length,
                liquidityHits: precheckRows.filter((row) => row.liquidityGate).length,
                settlementHits: precheckRows.filter((row) => row.settlementGate).length,
              };
              const topEvidence = precheckRows.find((row) => row.blockedGateCount > 0) ?? precheckRows[0];

              return (
                <>
                  <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
                    {precheckRows.map((row) => {
                      const unblockHint = row.unblockHint;
                      return (
                        <div key={`precheck-${row.id}`}>
                          {row.id}: incompetence={row.incompetenceGate ? 'block' : 'pass'} · maxIn={row.maxInGate ? 'block' : 'pass'} · liquidity={row.liquidityGate ? 'block' : 'pass'} · T+N={row.settlementGate ? 'block' : 'pass'} · blocked gates=<b>{row.blockedGateCount}</b> · primary blocker=<b>{row.primaryBlocker}</b> · severity=<b>{row.blockerSeverity}</b> · fingerprint=<b>{row.gateFingerprint}</b> · gate block score=<b>{row.gateBlockScore.toFixed(2)}</b> · readiness=<b>{row.readinessPct}%</b> · unblock hint=<b>{unblockHint}</b> => <b>{row.verdict}</b>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 6, padding: '8px 10px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', fontSize: 11 }}>
                    Buy gate precheck evidence panel: blocked rows=<b>{evidencePanel.blockedRows}/{precheckRows.length}</b> · incompetence hits=<b>{evidencePanel.incompetenceHits}</b> · maxIn hits=<b>{evidencePanel.maxInHits}</b> · liquidity hits=<b>{evidencePanel.liquidityHits}</b> · T+N hits=<b>{evidencePanel.settlementHits}</b>
                    {topEvidence ? (
                      <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                        top blocker evidence: <b>{topEvidence.id}</b> · blocker=<b>{topEvidence.primaryBlocker}</b> · fingerprint=<b>{topEvidence.gateFingerprint}</b> · unblock next=<b>{topEvidence.unblockHint}</b>
                      </div>
                    ) : null}
                  </div>
                </>
              );
            })()}
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Review isolated tags
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} title={executionSuggestionLockTitle} disabled={!manualCheckpointConfirmed} onClick={() => jumpTo('rebalance')}>
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
        const maxInThreshold = 0.03;
        const maxOutThreshold = 0.04;
        const whatIfRows = rows.slice(0, 4).map((r) => {
          const drift = Number.isFinite(r.deltaPct) ? r.deltaPct : 0;
          const maxInImpact = drift < 0 ? Math.max(0, Math.abs(drift) - maxInThreshold) : 0;
          const maxOutImpact = drift > 0 ? Math.max(0, Math.abs(drift) - maxOutThreshold) : 0;
          const verdict = maxInImpact > 0 || maxOutImpact > 0 ? 'guardrail-hit' : 'inside-guardrail';
          const envelopeLower = -(maxInThreshold + 0.01);
          const envelopeUpper = maxOutThreshold + 0.01;
          const envelopeStatus = drift < envelopeLower || drift > envelopeUpper ? 'outside-envelope' : 'inside-envelope';
          const envelopeBreachDistance = drift < envelopeLower
            ? envelopeLower - drift
            : drift > envelopeUpper
              ? drift - envelopeUpper
              : 0;
          const envelopeSafetyMargin = envelopeStatus === 'inside-envelope'
            ? Math.min(drift - envelopeLower, envelopeUpper - drift)
            : 0;
          const thesisRegimeThreshold = Math.max(driftThresholdPct * 1.8, 0.05);
          const thesisRegimeDrift = Math.abs(drift) >= thesisRegimeThreshold;
          const downWeightFactor = thesisRegimeDrift ? 0.85 : 1;
          const downWeightDeltaPct = thesisRegimeDrift ? (1 - downWeightFactor) * 100 : 0;
          const driftSeverity = Math.abs(drift) >= Math.max(driftThresholdPct * 2.4, 0.07) ? 'critical' : thesisRegimeDrift ? 'warning' : 'normal';
          const downWeightRationaleCode = thesisRegimeDrift ? `REGIME_DRIFT_${driftSeverity.toUpperCase()}` : 'REGIME_STABLE';
          return { id: String(r.id ?? '').trim(), drift, maxInImpact, maxOutImpact, verdict, envelopeLower, envelopeUpper, envelopeStatus, envelopeBreachDistance, envelopeSafetyMargin, thesisRegimeThreshold, thesisRegimeDrift, downWeightFactor, downWeightDeltaPct, driftSeverity, downWeightRationaleCode };
        });
        const totalMaxInImpact = whatIfRows.reduce((sum, r) => sum + r.maxInImpact, 0);
        const totalMaxOutImpact = whatIfRows.reduce((sum, r) => sum + r.maxOutImpact, 0);
        const netGuardrailPressure = totalMaxOutImpact - totalMaxInImpact;
        const pressureBias = netGuardrailPressure > 0 ? 'maxOut-heavy' : netGuardrailPressure < 0 ? 'maxIn-heavy' : 'balanced';
        const pressureSeverity = Math.abs(netGuardrailPressure) >= 0.03 ? 'elevated' : Math.abs(netGuardrailPressure) >= 0.015 ? 'watch' : 'normal';
        const thresholdHitCount = whatIfRows.filter((r) => r.maxInImpact > 0 || r.maxOutImpact > 0).length;
        const thresholdHitRatePct = whatIfRows.length > 0 ? Math.round((thresholdHitCount / whatIfRows.length) * 100) : 0;
        const peakImpactRow = whatIfRows.reduce((best, row) => {
          const score = row.maxInImpact + row.maxOutImpact;
          const bestScore = best.maxInImpact + best.maxOutImpact;
          return score > bestScore ? row : best;
        }, whatIfRows[0]);
        const peakImpactScorePct = (peakImpactRow.maxInImpact + peakImpactRow.maxOutImpact) * 100;
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
            <div style={{ marginTop: 6, fontSize: 11 }}>
              Liquidity cap sensitivity panel (execution sizing)
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              {([0.8, 1.0, 1.2] as const).map((cap) => {
                const capBuys = liquiditySettlementGateV0.estimatedBuys * cap;
                const capCoverage = capBuys > 0 ? liquiditySettlementGateV0.availableCash / capBuys : 1;
                const capHeadroom = liquiditySettlementGateV0.availableCash - capBuys;
                const capVerdict = capCoverage >= 1 ? 'sized' : 'clipped';
                const capUtilizationPct = capBuys > 0 ? Math.min(200, Math.max(0, (liquiditySettlementGateV0.availableCash / capBuys) * 100)) : 100;
                const clipAmount = capHeadroom < 0 ? Math.abs(capHeadroom) : 0;
                const executionSizingPressurePct = capBuys > 0 ? Math.min(100, (clipAmount / capBuys) * 100) : 0;
                const executionSizingBand = executionSizingPressurePct >= 15 ? 'high' : executionSizingPressurePct >= 5 ? 'medium' : 'low';
                const sizingAction = capCoverage >= 1 ? 'hold size' : capCoverage >= 0.9 ? 'trim lightly' : 'trim aggressively';
                const suggestedScalePct = capCoverage >= 1 ? 100 : Math.max(0, Math.min(100, capCoverage * 100));
                return (
                  <div key={`liquidity-cap-${cap}`}>
                    cap x{cap.toFixed(1)}: planned buy={capBuys.toFixed(2)} · cash coverage={capCoverage.toFixed(2)} · headroom={capHeadroom.toFixed(2)} · utilization={capUtilizationPct.toFixed(1)}% · clip={clipAmount.toFixed(2)} · pressure={executionSizingPressurePct.toFixed(1)}% · pressure band=<b>{executionSizingBand}</b> · action=<b>{sizingAction}</b> · suggested scale=<b>{suggestedScalePct.toFixed(1)}%</b> => <b>{capVerdict}</b>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              T+N settlement and cash-gap gate explainer
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              {(() => {
                const settlementBlocked = liquiditySettlementGateV0.settlementLagDays > 1;
                const cashGapBlocked = liquiditySettlementGateV0.cashGap > 0;
                const gateReason = settlementBlocked && cashGapBlocked
                  ? 'blocked by delayed settlement and positive cash gap'
                  : settlementBlocked
                    ? 'blocked by delayed settlement window'
                    : cashGapBlocked
                      ? 'blocked by positive cash gap forecast'
                      : 'pass: settlement window and cash gap are inside limits';
                const gateSeverity = settlementBlocked && cashGapBlocked ? 'high' : settlementBlocked || cashGapBlocked ? 'medium' : 'none';
                const settlementPenaltyPts = settlementBlocked ? Math.min(40, liquiditySettlementGateV0.settlementLagDays * 10) : 0;
                const cashGapPenaltyPts = cashGapBlocked ? Math.min(60, Math.max(5, liquiditySettlementGateV0.cashGap / 1000)) : 0;
                const gateScore = Math.max(0, 100 - settlementPenaltyPts - cashGapPenaltyPts);
                const unblockCashNeeded = cashGapBlocked ? liquiditySettlementGateV0.cashGap : 0;
                const earliestClearanceDays = settlementBlocked ? liquiditySettlementGateV0.settlementLagDays - 1 : 0;
                const nextOperatorAction = settlementBlocked && cashGapBlocked
                  ? 'stage sell-then-buy and top up cash'
                  : settlementBlocked
                    ? 'wait for settlement window'
                    : cashGapBlocked
                      ? 'top up cash or reduce buy size'
                      : 'proceed with planned sizing';
                return (
                  <div>
                    settlement gate(T+N={liquiditySettlementGateV0.settlementLagDays})={settlementBlocked ? 'block' : 'pass'} · cash-gap gate({liquiditySettlementGateV0.cashGap.toFixed(2)} {baseCcy || ''})={cashGapBlocked ? 'block' : 'pass'} · severity=<b>{gateSeverity}</b> · gate score=<b>{gateScore.toFixed(1)}</b> · unblock cash=<b>{unblockCashNeeded.toFixed(2)} {baseCcy || ''}</b> · earliest clearance=<b>T+{earliestClearanceDays}</b> · next action=<b>{nextOperatorAction}</b> · explanation=<b>{gateReason}</b>
                  </div>
                );
              })()}
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              MaxIn/MaxOut guardrail audit view (threshold trace)
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              {whatIfRows.map((r) => {
                const maxInThresholdHit = r.maxInImpact > 0;
                const maxOutThresholdHit = r.maxOutImpact > 0;
                const guardrailAuditVerdict = maxInThresholdHit || maxOutThresholdHit ? 'threshold-breached' : 'threshold-safe';
                const breachCount = Number(maxInThresholdHit) + Number(maxOutThresholdHit);
                const maxInBreachDistance = maxInThresholdHit ? r.maxInImpact : 0;
                const maxOutBreachDistance = maxOutThresholdHit ? r.maxOutImpact : 0;
                const dominantSide = maxInBreachDistance > maxOutBreachDistance ? 'maxIn' : maxOutBreachDistance > maxInBreachDistance ? 'maxOut' : 'balanced';
                const guardrailAuditScore = Math.min(100, (maxInBreachDistance + maxOutBreachDistance) * 1000);
                const guardrailAuditBand = guardrailAuditScore >= 20 ? 'critical' : guardrailAuditScore >= 10 ? 'elevated' : guardrailAuditScore > 0 ? 'watch' : 'clear';
                return (
                  <div key={`guardrail-audit-${r.id}`}>
                    {r.id}: maxIn threshold={maxInThreshold.toFixed(2)} ({maxInThresholdHit ? 'hit' : 'safe'}) · maxOut threshold={maxOutThreshold.toFixed(2)} ({maxOutThresholdHit ? 'hit' : 'safe'}) · breaches=<b>{breachCount}</b> · maxIn distance=<b>{(maxInBreachDistance * 100).toFixed(1)}%</b> · maxOut distance=<b>{(maxOutBreachDistance * 100).toFixed(1)}%</b> · dominant side=<b>{dominantSide}</b> · audit score=<b>{guardrailAuditScore.toFixed(1)}</b> · audit band=<b>{guardrailAuditBand}</b> · trace verdict=<b>{guardrailAuditVerdict}</b>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              Guardrail threshold what-if sandbox (maxIn/maxOut impacts)
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              {whatIfRows.map((r) => (
                <div key={`guardrail-whatif-${r.id}`}>
                  {r.id}: drift={(r.drift * 100).toFixed(1)}% · maxIn impact={r.maxInImpact > 0 ? `+${(r.maxInImpact * 100).toFixed(1)}%` : '0.0%'} · maxOut impact={r.maxOutImpact > 0 ? `+${(r.maxOutImpact * 100).toFixed(1)}%` : '0.0%'} => <b>{r.verdict}</b>
                </div>
              ))}
              <div>
                sandbox totals: maxIn impact=<b>{(totalMaxInImpact * 100).toFixed(1)}%</b> · maxOut impact=<b>{(totalMaxOutImpact * 100).toFixed(1)}%</b> · net pressure=<b>{(netGuardrailPressure * 100).toFixed(1)}%</b> · bias=<b>{pressureBias}</b> · severity=<b>{pressureSeverity}</b> · threshold-hit rows=<b>{thresholdHitCount}/{whatIfRows.length}</b> · hit rate=<b>{thresholdHitRatePct}%</b> · peak impact row=<b>{peakImpactRow.id || 'n/a'}</b> · peak impact score=<b>{peakImpactScorePct.toFixed(1)}%</b>
              </div>
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', fontSize: 11 }}>
              Guardrail-first evidence panel: threshold-hit rows=<b>{thresholdHitCount}/{whatIfRows.length}</b> · maxIn impact total=<b>{(totalMaxInImpact * 100).toFixed(1)}%</b> · maxOut impact total=<b>{(totalMaxOutImpact * 100).toFixed(1)}%</b> · pressure bias=<b>{pressureBias}</b> · pressure severity=<b>{pressureSeverity}</b>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                top guardrail evidence: <b>{peakImpactRow.id || 'n/a'}</b> · impact score=<b>{peakImpactScorePct.toFixed(1)}%</b> · recommendation=<b>{pressureBias === 'maxIn-heavy' ? 'prioritize maxIn relief' : pressureBias === 'maxOut-heavy' ? 'prioritize maxOut relief' : 'keep balanced guardrails'}</b>
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              Rebalance risk-envelope visualizer (dynamic decision bounds)
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              {whatIfRows.map((r) => {
                const envelopeUtilizationPct = r.envelopeUpper > r.envelopeLower
                  ? Math.min(200, Math.max(0, ((r.drift - r.envelopeLower) / (r.envelopeUpper - r.envelopeLower)) * 100))
                  : 0;
                const envelopePressureScore = r.envelopeStatus === 'outside-envelope'
                  ? Math.min(1, r.envelopeBreachDistance / 0.05)
                  : Math.max(0, 1 - Math.min(1, r.envelopeSafetyMargin / 0.05));
                const envelopePressureTier = envelopePressureScore >= 0.75 ? 'high' : envelopePressureScore >= 0.4 ? 'medium' : 'low';
                const envelopeAction = r.envelopeStatus === 'outside-envelope'
                  ? 'rebalance now'
                  : envelopePressureTier === 'high'
                    ? 'tighten guardrails'
                    : envelopePressureTier === 'medium'
                      ? 'watchlist'
                      : 'hold';
                return (
                  <div key={`risk-envelope-${r.id}`}>
                    {r.id}: envelope=[{(r.envelopeLower * 100).toFixed(1)}%, {(r.envelopeUpper * 100).toFixed(1)}%] · drift={(r.drift * 100).toFixed(1)}% => <b>{r.envelopeStatus}</b> · breach distance=<b>{(r.envelopeBreachDistance * 100).toFixed(1)}%</b> · safety margin=<b>{(r.envelopeSafetyMargin * 100).toFixed(1)}%</b> · utilization=<b>{envelopeUtilizationPct.toFixed(0)}%</b> · pressure score=<b>{envelopePressureScore.toFixed(2)}</b> · pressure tier=<b>{envelopePressureTier}</b> · action=<b>{envelopeAction}</b>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              Thesis-regime drift alert timeline (down-weight rationale)
            </div>
            <div style={{ marginTop: 4, display: 'grid', gap: 2, fontSize: 11 }}>
              {whatIfRows.map((r) => {
                const timelineAction = !r.thesisRegimeDrift
                  ? 'monitor'
                  : r.driftSeverity === 'critical'
                    ? 'escalate'
                    : 'review';
                return (
                  <div key={`thesis-regime-drift-${r.id}`}>
                    {r.id}: thesis/regime drift={r.thesisRegimeDrift ? 'alert' : 'stable'} · threshold=<b>{(r.thesisRegimeThreshold * 100).toFixed(1)}%</b> · drift severity=<b>{r.driftSeverity}</b> · down-weight factor=<b>{r.downWeightFactor.toFixed(2)}</b> · down-weight delta=<b>{r.downWeightDeltaPct.toFixed(1)}%</b> · rationale code=<b>{r.downWeightRationaleCode}</b> · timeline action=<b>{timelineAction}</b> · rationale={r.thesisRegimeDrift ? 'drift above tolerance; reduce recommendation weight' : 'inside tolerance; keep baseline weight'}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', border: '1px dashed rgba(245,158,11,0.55)', borderRadius: 10, background: 'rgba(245,158,11,0.08)', fontSize: 11 }}>
              AI recommender manual confirmation checkpoint: operator must confirm preflight checkpoint before any execution suggestion is treated as actionable. Without manual confirmation, recommendations stay in simulation-only mode.
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              Manual checkpoint status: <b>{manualCheckpointConfirmed ? 'confirmed' : 'not confirmed'}</b>
            </div>
            <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
              Execution suggestion mode: <b>{manualCheckpointConfirmed ? 'unlocked (manual gate open)' : 'locked (simulation-only)'}</b>
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 10, background: 'rgba(255,255,255,0.01)', fontSize: 11 }}>
              Manual confirmation evidence panel: checkpoint status=<b>{manualCheckpointConfirmed ? 'confirmed' : 'pending'}</b> · execution mode=<b>{manualCheckpointConfirmed ? 'live-actionable' : 'simulation-only'}</b> · preflight handoff=<b>{manualCheckpointConfirmed ? 'open' : 'blocked'}</b>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                checkpoint evidence trace: next operator action=<b>{manualCheckpointConfirmed ? 'review live order routing' : 'confirm checkpoint and open preflight'}</b> · gate rationale=<b>{manualCheckpointConfirmed ? 'manual confirmation present' : 'manual confirmation missing'}</b>
              </div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} title={executionSuggestionLockTitle} disabled={!manualCheckpointConfirmed} onClick={() => jumpTo('rebalance')}>
                Open liquidity-sensitive orders
              </button>
              <button
                type="button"
                className="button secondary"
                style={{ padding: '4px 8px' }}
                onClick={() => {
                  setManualCheckpointConfirmed(true);
                  openPreflightForRun();
                }}
              >
                {manualCheckpointConfirmed ? 'Manual checkpoint confirmed' : 'Confirm manual checkpoint'}
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
}
