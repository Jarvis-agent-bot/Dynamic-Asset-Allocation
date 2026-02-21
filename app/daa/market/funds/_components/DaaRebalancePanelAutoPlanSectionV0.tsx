import { OrdersReviewV0 } from '../../../_components/OrdersReviewV0';
import { type DriftRebalanceBacktestResult } from '@/src/core/backtestDriftRebalance';
import { fmtPct01 } from './DaaRebalancePanel.helpersV0';

type AutoPlanScenarioKeyV0 = 'A' | 'B';

type AutoPlanScenarioPresetV0 = {
  id: string;
  name: string;
};

type Props = {
  autoPlanScenario: AutoPlanScenarioKeyV0;
  setAutoPlanScenario: (next: AutoPlanScenarioKeyV0) => void;
  autoPlanPresetNameV0: string;
  setAutoPlanPresetNameV0: (value: string) => void;
  saveAutoPlanScenarioPresetV0: () => void;
  autoPlanSelectedPresetIdV0: string;
  setAutoPlanSelectedPresetIdV0: (value: string) => void;
  autoPlanPresetsV0: AutoPlanScenarioPresetV0[];
  loadAutoPlanScenarioPresetV0: (presetId: string) => void;
  deleteAutoPlanScenarioPresetV0: (presetId: string) => void;
  seedAutoPlanFromCurrentSnapshotV0: () => void;
  runAutoPlanV0: () => void;
  doCopyAutoPlanV0: () => void;
  autoPlanResult: DriftRebalanceBacktestResult | null;
  autoPlanCopyStatus: 'idle' | 'ok' | 'error';
  autoPlanThresholdOverridePct: number | null;
  driftThresholdPct: number;
  setAutoPlanThresholdOverridePctForActive: (value: number | null) => void;
  autoPlanThresholdPctUsed: number;
  autoPlanInputText: string;
  setAutoPlanInputTextForActive: (value: string) => void;
  autoPlanError: string | null;
  autoPlanResultA: DriftRebalanceBacktestResult | null;
  autoPlanResultB: DriftRebalanceBacktestResult | null;
  baseCcy: string | null;
  formatWeightsDiffLines: (args: { before: any; after: any }) => string[];
  rebalanceMinTradeNotional: number;
  whatIfFeeBps: number;
};

export default function DaaRebalancePanelAutoPlanSectionV0(props: Props) {
  const {
    autoPlanScenario,
    setAutoPlanScenario,
    autoPlanPresetNameV0,
    setAutoPlanPresetNameV0,
    saveAutoPlanScenarioPresetV0,
    autoPlanSelectedPresetIdV0,
    setAutoPlanSelectedPresetIdV0,
    autoPlanPresetsV0,
    loadAutoPlanScenarioPresetV0,
    deleteAutoPlanScenarioPresetV0,
    seedAutoPlanFromCurrentSnapshotV0,
    runAutoPlanV0,
    doCopyAutoPlanV0,
    autoPlanResult,
    autoPlanCopyStatus,
    autoPlanThresholdOverridePct,
    driftThresholdPct,
    setAutoPlanThresholdOverridePctForActive,
    autoPlanThresholdPctUsed,
    autoPlanInputText,
    setAutoPlanInputTextForActive,
    autoPlanError,
    autoPlanResultA,
    autoPlanResultB,
    baseCcy,
    formatWeightsDiffLines,
    rebalanceMinTradeNotional,
    whatIfFeeBps,
  } = props;

  return (
    <div
      id="auto-plan"
      style={{
        scrollMarginTop: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div style={{ fontWeight: 800 }}>Auto plan v0</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Scenario
            </span>
            <button
              type="button"
              className={autoPlanScenario === 'A' ? 'button' : 'button secondary'}
              onClick={() => setAutoPlanScenario('A')}
              style={{ padding: '6px 10px' }}
              title="Scenario A"
            >
              A
            </button>
            <button
              type="button"
              className={autoPlanScenario === 'B' ? 'button' : 'button secondary'}
              onClick={() => setAutoPlanScenario('B')}
              style={{ padding: '6px 10px' }}
              title="Scenario B"
            >
              B
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <input
              value={autoPlanPresetNameV0}
              onChange={(e) => setAutoPlanPresetNameV0(e.target.value)}
              placeholder="Preset name"
              style={{
                width: 140,
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid rgba(127,127,127,0.35)',
                background: 'rgba(0,0,0,0.12)',
              }}
            />
            <button
              type="button"
              className="button secondary"
              onClick={saveAutoPlanScenarioPresetV0}
              style={{ padding: '6px 10px' }}
              disabled={!autoPlanPresetNameV0.trim()}
              title="Save current A/B scenario input as a reusable preset"
            >
              Save preset
            </button>
            <select
              value={autoPlanSelectedPresetIdV0}
              onChange={(e) => setAutoPlanSelectedPresetIdV0(e.target.value)}
              style={{
                maxWidth: 180,
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid rgba(127,127,127,0.35)',
                background: 'rgba(0,0,0,0.12)',
              }}
              aria-label="Saved scenario presets"
            >
              <option value="">Saved presets</option>
              {autoPlanPresetsV0.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button secondary"
              onClick={() => loadAutoPlanScenarioPresetV0(autoPlanSelectedPresetIdV0)}
              style={{ padding: '6px 10px' }}
              disabled={!autoPlanSelectedPresetIdV0}
              title="Load selected preset into Scenario A/B"
            >
              Load preset
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => deleteAutoPlanScenarioPresetV0(autoPlanSelectedPresetIdV0)}
              style={{ padding: '6px 10px' }}
              disabled={!autoPlanSelectedPresetIdV0}
              title="Delete selected preset"
            >
              Delete
            </button>
          </div>
          <button type="button" className="button secondary" onClick={seedAutoPlanFromCurrentSnapshotV0} style={{ padding: '6px 10px' }}>
            Seed from current snapshot
          </button>
          <button type="button" className="button secondary" onClick={runAutoPlanV0} style={{ padding: '6px 10px' }}>
            Generate plan
          </button>
          <button type="button" className="button" onClick={doCopyAutoPlanV0} style={{ padding: '6px 10px' }} disabled={!autoPlanResult}>
            {autoPlanCopyStatus === 'ok' ? 'Copied' : autoPlanCopyStatus === 'error' ? 'Copy failed' : 'Copy plan (md)'}
          </button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        One-click dynamic plan generator: drift (price series) -&gt; trigger policy -&gt; orders, with a preview weight diff. This is a deterministic simulation
        (paper only); it does not execute or record orders.
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Trigger threshold (%)
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            value={autoPlanThresholdOverridePct === null ? '' : String((autoPlanThresholdOverridePct * 100).toFixed(2))}
            placeholder={String((driftThresholdPct * 100).toFixed(2))}
            onChange={(e) => {
              const v = String(e.target.value ?? '').trim();
              if (!v) {
                setAutoPlanThresholdOverridePctForActive(null);
                return;
              }
              const n = Number(v);
              if (!Number.isFinite(n) || n < 0) return;
              setAutoPlanThresholdOverridePctForActive(n / 100);
            }}
            style={{
              width: 120,
              fontFamily: 'ui-monospace, SFMono-Regular',
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(127,127,127,0.35)',
              background: 'rgba(0,0,0,0.12)',
            }}
            title="Override drift threshold for this scenario only (percent)"
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => setAutoPlanThresholdOverridePctForActive(null)}
            disabled={autoPlanThresholdOverridePct === null}
            style={{ padding: '6px 10px' }}
            title="Clear per-scenario override"
          >
            Use global
          </button>
          <div className="muted" style={{ fontSize: 11 }}>
            used={(autoPlanThresholdPctUsed * 100).toFixed(2)}%; global={(driftThresholdPct * 100).toFixed(2)}%
          </div>
        </div>
        <textarea
          value={autoPlanInputText}
          onChange={(e) => setAutoPlanInputTextForActive(e.target.value)}
          rows={8}
          placeholder={'Paste {seriesBySymbol: {...}} or {snapshots:[{date,prices}]}' }
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, SFMono-Regular',
            fontSize: 12,
            padding: 10,
            borderRadius: 10,
            border: '1px solid rgba(127,127,127,0.35)',
            background: 'rgba(0,0,0,0.12)',
          }}
        />
        {autoPlanError ? <div style={{ fontSize: 12, color: 'var(--danger, #b00020)' }}>{autoPlanError}</div> : null}
        {autoPlanResultA && autoPlanResultB ? (
          <details style={{ marginTop: 6, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Compare scenarios (A vs B)</summary>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 10, fontSize: 12, alignItems: 'baseline' }}>
                <div />
                <div style={{ fontWeight: 800 }}>A</div>
                <div style={{ fontWeight: 800 }}>B</div>
                <div className="muted">Δ (B-A)</div>
                <div className="muted">rebalanceCount</div>
                <div>{autoPlanResultA.summary.rebalanceCount}</div>
                <div>{autoPlanResultB.summary.rebalanceCount}</div>
                <div className="muted">{autoPlanResultB.summary.rebalanceCount - autoPlanResultA.summary.rebalanceCount}</div>
                <div className="muted">turnoverNotional</div>
                <div>
                  {autoPlanResultA.summary.turnoverNotional.toFixed(2)}
                  {baseCcy ? ` ${baseCcy}` : ''}
                </div>
                <div>
                  {autoPlanResultB.summary.turnoverNotional.toFixed(2)}
                  {baseCcy ? ` ${baseCcy}` : ''}
                </div>
                <div className="muted">
                  {(autoPlanResultB.summary.turnoverNotional - autoPlanResultA.summary.turnoverNotional).toFixed(2)}
                  {baseCcy ? ` ${baseCcy}` : ''}
                </div>
                <div className="muted">finalEquityAbs</div>
                <div>{autoPlanResultA.summary.finalEquityAbs.toFixed(2)}</div>
                <div>{autoPlanResultB.summary.finalEquityAbs.toFixed(2)}</div>
                <div className="muted">{(autoPlanResultB.summary.finalEquityAbs - autoPlanResultA.summary.finalEquityAbs).toFixed(2)}</div>
              </div>
              {autoPlanResultA.states?.final && autoPlanResultB.states?.final ? (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Final weights diff (A → B)</div>
                  <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                    {formatWeightsDiffLines({ before: autoPlanResultA.states.final, after: autoPlanResultB.states.final }).join('\n')}
                  </pre>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 11 }}>
                  (Missing states.final for at least one scenario; re-generate to compare weight diffs.)
                </div>
              )}
            </div>
          </details>
        ) : autoPlanResultA || autoPlanResultB ? (
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Tip: generate both Scenario A and Scenario B to compare.
          </div>
        ) : null}
        {autoPlanResult ? (
          <div style={{ marginTop: 6, padding: '10px 12px', border: '1px solid rgba(127,127,127,0.35)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>Plan summary</div>
              <div className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                schemaVersion={(autoPlanResult as any).schemaVersion}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              rebalanceCount=<b>{autoPlanResult.summary.rebalanceCount}</b> · turnoverNotional=<b>{autoPlanResult.summary.turnoverNotional.toFixed(2)}</b>
              {baseCcy ? ` ${baseCcy}` : ''} · equityAbs: {autoPlanResult.summary.initialEquityAbs.toFixed(2)} → {autoPlanResult.summary.finalEquityAbs.toFixed(2)}
            </div>
            {autoPlanResult.warnings?.length ? (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--danger, #b00020)' }}>Warnings ({autoPlanResult.warnings.length})</summary>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger, #b00020)' }}>
                  {autoPlanResult.warnings.map((w, idx) => (
                    <div key={idx}>{String(w)}</div>
                  ))}
                </div>
              </details>
            ) : null}
            {autoPlanResult.states ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Overall diff (initial → final)</div>
                <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                  {formatWeightsDiffLines({ before: autoPlanResult.states.initial, after: autoPlanResult.states.final }).join('\n')}
                </pre>
              </div>
            ) : null}
            {Array.isArray((autoPlanResult as any).timeline) && (autoPlanResult as any).timeline.length ? (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>Timeline (drift over time) ({(autoPlanResult as any).timeline.length})</summary>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {(autoPlanResult as any).timeline.map((pt: any, idx: number) => {
                    const stats: any = pt?.trigger?.stats ?? {};
                    const maxAbs = Number(stats.maxAbsDriftPct ?? Number.NaN);
                    const threshold = Number(stats.thresholdPct ?? autoPlanThresholdPctUsed);
                    const ratio = threshold > 0 && Number.isFinite(maxAbs) ? Math.min(1, Math.max(0, maxAbs / threshold)) : 0;
                    const hit = !!pt?.trigger?.shouldRebalance;
                    const top = Array.isArray(pt?.topAbsDriftsPct01) ? pt.topAbsDriftsPct01.slice(0, 3) : [];
                    return (
                      <div
                        key={`${pt?.date ?? idx}-${idx}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '110px 1fr 90px',
                          gap: 10,
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular', fontSize: 11 }}>{String(pt?.date ?? '')}</div>
                        <div style={{ height: 10, borderRadius: 999, background: 'rgba(127,127,127,0.25)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${(ratio * 100).toFixed(1)}%`,
                              height: '100%',
                              background: hit ? 'rgba(176,0,32,0.8)' : 'rgba(64,160,255,0.7)',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, textAlign: 'right' as const }}>
                          <span className={hit ? '' : 'muted'} style={{ fontWeight: hit ? 800 : 400 }}>
                            {fmtPct01(maxAbs)}
                          </span>
                        </div>
                        <div style={{ gridColumn: '1 / -1', fontSize: 11 }} className="muted">
                          threshold={fmtPct01(threshold)}
                          {String(stats.maxAbsDriftSymbol ?? '') ? `; maxSym=${String(stats.maxAbsDriftSymbol)}` : ''}; eligibleOrders=
                          {String(stats.eligibleOrderCount ?? '-')}; shouldRebalance={String(hit)}
                          {top.length
                            ? `; top=${top
                                .map((x: any) => `${String(x?.symbol ?? '')}:${fmtPct01(Number(x?.absDriftPct01 ?? Number.NaN))}`)
                                .filter(Boolean)
                                .join(', ')}`
                            : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>Events</div>
              {autoPlanResult.events?.length ? (
                <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                  {autoPlanResult.events.map((ev: any, idx: number) => {
                    const stats: any = ev?.trigger?.stats ?? {};
                    return (
                      <div key={`${ev.kind}-${ev.date}-${idx}`} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>
                            {ev.kind} @ <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{ev.date}</span>
                          </div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            maxAbsDriftPct={fmtPct01(Number(stats.maxAbsDriftPct ?? Number.NaN))}; maxAbsDriftSymbol=
                            {String(stats.maxAbsDriftSymbol ?? '')}
                          </div>
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                          shouldRebalance={String(!!ev?.trigger?.shouldRebalance)}; eligibleOrders={String(stats.eligibleOrderCount ?? '-')}; reasons=
                          {Array.isArray(ev?.trigger?.reasons) ? ev.trigger.reasons.slice(0, 2).join('; ') : ''}
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Preview diff (before → after)</div>
                          <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                            {formatWeightsDiffLines({ before: ev.before, after: ev.after }).join('\n')}
                          </pre>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <OrdersReviewV0
                            title="Orders"
                            orders={Array.isArray(ev?.orders) ? ev.orders : []}
                            cashStart={typeof ev?.before?.cashAbs === 'number' ? ev.before.cashAbs : null}
                            minTradeNotional={rebalanceMinTradeNotional}
                            ccy={baseCcy}
                            feeBps={whatIfFeeBps}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  No events.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
