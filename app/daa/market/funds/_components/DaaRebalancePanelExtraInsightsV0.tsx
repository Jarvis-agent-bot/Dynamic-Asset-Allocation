import { calibrateQatFeedbackLoopV0 } from '@/src/daa/qatFeedbackCalibrationLoopV0';
import { buildGuardrailBreachExplainerTimelineV0 } from '@/src/daa/guardrailBreachExplainerTimelineV0';
import { scoreHumanFactorLogicConsistencyV0 } from '@/src/daa/humanFactorLogicConsistencyScoringV0';
import { runQatDecisionMatrixEngineV0 } from '@/src/daa/qatDecisionMatrixEngineV0';

type RebalanceRowV0 = {
  id: string;
  targetPct: number;
  deltaPct: number;
};

type OrderLikeV0 = {
  symbol: string;
  side: string;
  notional: number;
};

type PreRunViolationV0 = {
  level: 'blocker' | 'warning' | string;
};

type PriceDataWarningsV0 = {
  missing: Array<string | { sym?: string }>;
  lastClose: Array<string | { sym?: string }>;
};

type Props = {
  baseCcy: string | null;
  portfolioCash: number;
  rebalanceTableRows: RebalanceRowV0[];
  effectiveOrders: OrderLikeV0[];
  priceDataWarningsV0: PriceDataWarningsV0;
  preRunViolationsV0: PreRunViolationV0[];
  preTradeCashCheck: { blocking: boolean };
  driftThresholdPct: number;
  paperRunError: string | null;
  jumpTo: (targetId: string) => void;
  openPreflightForRun: () => void;
};

function warningSymV0(v: string | { sym?: string }): string {
  if (typeof v === 'string') return String(v || '').trim();
  return String(v?.sym || '').trim();
}

export default function DaaRebalancePanelExtraInsightsV0({
  baseCcy,
  portfolioCash,
  rebalanceTableRows,
  effectiveOrders,
  priceDataWarningsV0,
  preRunViolationsV0,
  preTradeCashCheck,
  driftThresholdPct,
  paperRunError,
  jumpTo,
  openPreflightForRun,
}: Props) {
  return (
    <>
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
      {(() => {
        const rows = rebalanceTableRows.slice(0, 8);
        if (!rows.length) return null;
        const missingSet = new Set(priceDataWarningsV0.missing.map((x) => warningSymV0(x)));
        const staleSet = new Set(priceDataWarningsV0.lastClose.map((x) => warningSymV0(x)));
        const trace = rows.map((r) => {
          const id = String(r.id ?? '').trim();
          const driftAbs = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const hMultiplier = Math.max(0.75, 1 - Math.min(0.2, driftAbs * 1.2));
          const aiBias = missingSet.has(id) ? 0.85 : staleSet.has(id) ? 0.92 : 1.05;
          const quality = hMultiplier * aiBias;
          const wQat = Math.max(0, r.targetPct * quality);
          const action = wQat >= r.targetPct * 0.9 ? 'keep' : wQat >= r.targetPct * 0.75 ? 'trim' : 'defer';
          return { id, targetPct: r.targetPct, quality, wQat, action };
        });
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Usable W_qat decision flow</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Actionable step-by-step flow from W_target to W_qat to routing decision.</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Mainline W_qat formula task</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>W_qat = W_base * H_multiplier * AI_bias with visible per-symbol trace.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {trace.map((r) => (
                <div key={r.id} style={{ fontSize: 11 }}>
                  {r.id}: target={(r.targetPct * 100).toFixed(2)}% {'->'} Q={r.quality.toFixed(2)} {'->'} W_qat={(r.wQat * 100).toFixed(2)}% {'->'} action=<b>{r.action}</b>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                Apply W_qat to target weights
              </button>
              <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                Open W_qat order routing
              </button>
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 8);
        if (!rows.length) return null;
        const missingSet = new Set(priceDataWarningsV0.missing.map((x) => warningSymV0(x)));
        const staleSet = new Set(priceDataWarningsV0.lastClose.map((x) => warningSymV0(x)));
        const qatRows = rows.map((r) => {
          const id = String(r.id ?? '').trim();
          const driftAbs = Math.abs(Number.isFinite(r.deltaPct) ? r.deltaPct : 0);
          const hMultiplier = Math.max(0.75, 1 - Math.min(0.2, driftAbs * 1.2));
          const aiBias = missingSet.has(id) ? 0.85 : staleSet.has(id) ? 0.92 : 1.05;
          const wQatPct = Math.max(0, r.targetPct * hMultiplier * aiBias);
          return { id, targetPct: Math.max(0, r.targetPct), wQatPct };
        });
        const blockerCount = preRunViolationsV0.filter((v) => v.level === 'blocker').length;
        const warningCount = preRunViolationsV0.filter((v) => v.level === 'warning').length;
        const feedbackSignal = Math.max(-1, Math.min(1, (warningCount - blockerCount) / 5));
        const calibratedRows = calibrateQatFeedbackLoopV0(qatRows, feedbackSignal);
        const avgImpact = calibratedRows.length
          ? calibratedRows.reduce((sum, r) => sum + r.impactPct, 0) / calibratedRows.length
          : 0;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>W_qat feedback calibration loop</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Operator-facing before/after W_qat impact from closed-loop feedback calibration.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              feedback signal=<b>{feedbackSignal.toFixed(2)}</b> · avg impact=<b>{(avgImpact * 100).toFixed(2)}%</b>
            </div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {calibratedRows.slice(0, 5).map((r) => (
                <div key={r.id} style={{ fontSize: 11 }}>
                  {r.id}: before={(r.beforeWQatPct * 100).toFixed(2)}% {'->'} after=<b>{(r.afterWQatPct * 100).toFixed(2)}%</b> (impact {(r.impactPct * 100).toFixed(2)}%)
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const guardrailBlockers = preRunViolationsV0.filter((v) => v.level === 'blocker');
        const guardrailWarnings = preRunViolationsV0.filter((v) => v.level === 'warning');
        const canExecute = guardrailBlockers.length === 0 && !preTradeCashCheck.blocking;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${canExecute ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: canExecute ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Guardrail-first execution gate</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Execution is permitted only after guardrails pass; otherwise route to remediation first.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              status=<b style={{ color: canExecute ? '#16a34a' : 'var(--danger)' }}>{canExecute ? 'ready-to-execute' : 'blocked-by-guardrails'}</b> · blockers=<b>{guardrailBlockers.length}</b> · warnings=<b>{guardrailWarnings.length}</b>
            </div>
            {!canExecute ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
                  Resolve guardrails in preflight
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                  Hold execution and review orders
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const guardrailBlockers = preRunViolationsV0.filter((v) => v.level === 'blocker');
        const guardrailWarnings = preRunViolationsV0.filter((v) => v.level === 'warning');
        const timeline = buildGuardrailBreachExplainerTimelineV0([
          {
            gate: 'price-warnings',
            blocked: priceDataWarningsV0.missing.length > 0,
            reason: priceDataWarningsV0.missing.length > 0
              ? `${priceDataWarningsV0.missing.length} symbols missing live price`
              : 'all symbols have live prices',
          },
          {
            gate: 'guardrail-violations',
            blocked: guardrailBlockers.length > 0,
            reason: guardrailBlockers.length > 0
              ? `${guardrailBlockers.length} blocker violations detected`
              : `no blocker violations (${guardrailWarnings.length} warnings)`,
          },
          {
            gate: 'cash-settlement',
            blocked: preTradeCashCheck.blocking,
            reason: preTradeCashCheck.blocking ? 'pre-trade cash/settlement check failed' : 'cash/settlement check passed',
          },
          {
            gate: 'liquidity-t+n',
            blocked: preTradeCashCheck.blocking,
            reason: preTradeCashCheck.blocking ? 'liquidity T+N gate blocked by settlement coverage' : 'liquidity T+N gate passed',
          },
        ]);
        const blockedCount = timeline.filter((t) => t.status === 'blocked').length;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${blockedCount ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)'}`, borderRadius: 12, background: blockedCount ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Guardrail-breach explainer timeline</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Gate-by-gate timeline showing why execution is blocked or allowed.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {timeline.map((t, idx) => (
                <div key={t.gate} style={{ fontSize: 11 }}>
                  {idx + 1}. gate=<b>{t.gate}</b> · status=<b style={{ color: t.status === 'pass' ? '#16a34a' : 'var(--danger)' }}>{t.status}</b> · reason={t.reason}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 10);
        if (!rows.length) return null;
        const maxInPct = 0.04;
        const maxOutPct = 0.05;
        const breaches = rows
          .map((r) => {
            const drift = Number.isFinite(r.deltaPct) ? r.deltaPct : 0;
            const side = drift < 0 ? 'in' : 'out';
            const limit = side === 'in' ? maxInPct : maxOutPct;
            const breach = Math.abs(drift) > limit;
            return { id: String(r.id ?? ''), drift, side, limit, breach };
          })
          .filter((x) => x.breach)
          .slice(0, 6);
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${breaches.length ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)'}`, borderRadius: 12, background: breaches.length ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>MaxIn / MaxOut limits</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Clamp per-symbol move sizes before routing execution.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              MaxIn=<b>{(maxInPct * 100).toFixed(1)}%</b> · MaxOut=<b>{(maxOutPct * 100).toFixed(1)}%</b> · breaches=<b>{breaches.length}</b>
            </div>
            {breaches.length ? (
              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                {breaches.map((x) => (
                  <div key={x.id} style={{ fontSize: 11 }}>
                    {x.id}: drift={(x.drift * 100).toFixed(1)}% exceeds {x.side === 'in' ? 'MaxIn' : 'MaxOut'} {(x.limit * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const buyNotional = effectiveOrders.filter((o) => o.side === 'BUY').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
        const sellNotional = effectiveOrders.filter((o) => o.side === 'SELL').reduce((sum, o) => sum + Math.max(0, Number(o.notional || 0)), 0);
        const driftPressure = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct, 0.02)).length;
        const rebalanceAlpha = Math.max(0, sellNotional * 0.0006 - buyNotional * 0.0002);
        const humanFactorAlpha = Math.max(0, (100 - preRunViolationsV0.length * 8) * 0.8);
        const avoidedLoss = Math.max(0, driftPressure * 12 + (preTradeCashCheck.blocking ? 25 : 0));
        const total = rebalanceAlpha + humanFactorAlpha + avoidedLoss;
        const wBaseAdjustmentPct = Math.max(-8, Math.min(8, ((avoidedLoss - rebalanceAlpha) / Math.max(1, total)) * 100));
        const wBaseAdjustmentDirection = wBaseAdjustmentPct >= 0 ? 'increase' : 'decrease';
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Monthly attribution evolution report</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Split monthly attribution into rebalance alpha, human-factor alpha, and avoided loss.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11 }}>rebalance alpha: <b>{rebalanceAlpha.toFixed(2)}</b> ({baseCcy || 'base'})</div>
              <div style={{ fontSize: 11 }}>human-factor alpha: <b>{humanFactorAlpha.toFixed(2)}</b> ({baseCcy || 'base'})</div>
              <div style={{ fontSize: 11 }}>avoided loss: <b>{avoidedLoss.toFixed(2)}</b> ({baseCcy || 'base'})</div>
              <div style={{ fontSize: 11 }}>total monthly attribution: <b>{total.toFixed(2)}</b> ({baseCcy || 'base'})</div>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              W_base adjustment suggestion: {wBaseAdjustmentDirection} by {Math.abs(wBaseAdjustmentPct).toFixed(2)}% next month (attribution-driven).
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trace: rebalance={sellNotional.toFixed(2)} sell vs {buyNotional.toFixed(2)} buy · human-factor score base={Math.max(0, 100 - preRunViolationsV0.length * 8)} · pressure={driftPressure}
            </div>
          </div>
        );
      })()}
      {(() => {
        const recRows = rebalanceTableRows.slice(0, 10);
        if (!recRows.length) return null;
        const missingSet = new Set(priceDataWarningsV0.missing.map((x) => warningSymV0(x)));
        const staleSet = new Set(priceDataWarningsV0.lastClose.map((x) => warningSymV0(x)));
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Operator-visible factor trace by recommendation</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Every recommendation includes factor-level rationale before order routing.</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {recRows.map((r) => {
                const id = String(r.id ?? '').trim();
                const decision = runQatDecisionMatrixEngineV0({
                  wBase: r.targetPct,
                  driftPct: r.deltaPct,
                  thresholdPct: driftThresholdPct,
                  isMissingPrice: missingSet.has(id),
                  isStalePrice: staleSet.has(id),
                });
                const { hMultiplier, aiBias, wQat, recommendation } = decision;
                return (
                  <div key={id} style={{ fontSize: 11 }}>
                    {id}: rec=<b>{recommendation}</b> · factors(W_base={(r.targetPct * 100).toFixed(2)}%, H={hMultiplier.toFixed(2)}, AI={aiBias.toFixed(2)}, thr={(driftThresholdPct * 100).toFixed(2)}%, W_qat={(wQat * 100).toFixed(2)}%)
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {(() => {
        const blockerCount = preRunViolationsV0.filter((v) => v.level === 'blocker').length;
        const warningCount = preRunViolationsV0.filter((v) => v.level === 'warning').length;
        const logicDivergence = rebalanceTableRows.filter((r) => Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 1.5, 0.03)).length;
        const loopScoring = scoreHumanFactorLogicConsistencyV0({
          blockerCount,
          warningCount,
          logicDivergenceCount: logicDivergence,
          missingPriceCount: priceDataWarningsV0.missing.length,
        });
        const { humanFactorScore, logicConsistencyScore, evidenceCoveragePct, loopStatus } = loopScoring;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${loopStatus === 'stable loop' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}`, borderRadius: 12, background: loopStatus === 'stable loop' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Human-factor + logic-consistency loop</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Evaluate analyst behavior and logic consistency in one closed feedback loop.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              human-factor=<b>{humanFactorScore}</b> · logic-consistency=<b>{logicConsistencyScore}</b> · evidence-coverage=<b>{evidenceCoveragePct}%</b> · loop=<b style={{ color: loopStatus === 'stable loop' ? '#16a34a' : 'var(--danger)' }}>{loopStatus}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trace: blockers {blockerCount}×18 + warnings {warningCount}×5 · divergence {logicDivergence}×7 + missing prices {priceDataWarningsV0.missing.length}×10
            </div>
            {loopStatus !== 'stable loop' ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Resolve thesis consistency
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => openPreflightForRun()}>
                  Re-run human-factor preflight
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const eliteSignals = [
          { name: 'Desk-A', defensive: preTradeCashCheck.blocking || priceDataWarningsV0.missing.length > 0 },
          { name: 'Desk-B', defensive: rebalanceTableRows.filter((r) => r.deltaPct <= -Math.max(driftThresholdPct, 0.02)).length >= 3 },
          { name: 'Desk-C', defensive: preRunViolationsV0.filter((v) => v.level === 'blocker').length > 0 || Boolean(paperRunError) },
        ];
        const defenseVotes = eliteSignals.filter((s) => s.defensive).length;
        const consensusDefense = defenseVotes >= 2;
        const rows = rebalanceTableRows.slice(0, 30);
        const bucketKey = (id: string) => (/^\d{6}$/.test(id) ? 'CN-A' : /^HK/i.test(id) || /^0\d{4}$/.test(id) ? 'HK' : /^[A-Z]{1,5}$/.test(id) ? 'US' : 'OTHER');
        const bucketCounts = new Map<string, number>();
        for (const r of rows) {
          const key = bucketKey(String(r.id ?? '').trim());
          bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
        }
        const topShare = rows.length ? Math.max(...Array.from(bucketCounts.values(), (v) => v / rows.length)) : 0;
        const concentrationRisk = rows.length ? topShare >= 0.55 || bucketCounts.size <= 2 : false;
        const earlyWarning = consensusDefense || concentrationRisk;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${earlyWarning ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, background: earlyWarning ? 'rgba(220,38,38,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Analyst-consensus shift early-warning</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Combine consensus and concentration cues to flag early regime-risk shifts.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              consensus cue=<b style={{ color: consensusDefense ? 'var(--danger)' : '#16a34a' }}>{consensusDefense ? 'defense shift detected' : 'stable risk posture'}</b> · concentration cue=<b style={{ color: concentrationRisk ? 'var(--danger)' : '#16a34a' }}>{concentrationRisk ? 'hidden concentration risk' : 'diversity acceptable'}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              defense votes {defenseVotes}/3 · top bucket share {(topShare * 100).toFixed(1)}% · buckets {bucketCounts.size || 0}
            </div>
            {earlyWarning ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Re-check analyst concentration cues
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                  Stage defensive rebalance routing
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
      {(() => {
        const rows = rebalanceTableRows.slice(0, 30);
        if (!rows.length) return null;
        const bucketKey = (id: string) => (/^\d{6}$/.test(id) ? 'CN-A' : /^HK/i.test(id) || /^0\d{4}$/.test(id) ? 'HK' : /^[A-Z]{1,5}$/.test(id) ? 'US' : 'OTHER');
        const bucketCounts = new Map<string, number>();
        for (const r of rows) {
          const key = bucketKey(String(r.id ?? '').trim());
          bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
        }
        const topShare = Math.max(...Array.from(bucketCounts.values(), (v) => v / rows.length));
        const concentrationRisk = topShare >= 0.55 || bucketCounts.size <= 2;
        return (
          <div style={{ marginTop: 8, padding: '10px 12px', border: `1px solid ${concentrationRisk ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, background: concentrationRisk ? 'rgba(220,38,38,0.1)' : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Analyst correlation-diversity check</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Prevent hidden concentration by checking cross-bucket style diversity.</div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              buckets=<b>{bucketCounts.size}</b> · top correlation bucket share=<b>{(topShare * 100).toFixed(1)}%</b> · status=<b style={{ color: concentrationRisk ? 'var(--danger)' : '#16a34a' }}>{concentrationRisk ? 'hidden concentration risk' : 'diversity acceptable'}</b>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              trace: {Array.from(bucketCounts.entries()).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </div>
            {concentrationRisk ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('target-weights')}>
                  Rebalance concentration buckets
                </button>
                <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={() => jumpTo('rebalance')}>
                  Stage de-correlation orders
                </button>
              </div>
            ) : null}
          </div>
        );
      })()}
    </>
  );
}
