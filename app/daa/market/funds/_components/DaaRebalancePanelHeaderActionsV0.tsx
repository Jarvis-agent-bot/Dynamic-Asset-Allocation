'use client';

import Link from 'next/link';
import DaaDynamicRebalanceStatusPillV0 from './DaaDynamicRebalanceStatusPillV0';
import { MARKET_FUNDS_QUICK_JUMPS_V0 } from '@/src/daa/keyboardFocusMapV0';

type Props = {
  driftOverviewV0: any;
  rev: number;
  jumpTo: (targetId: string) => void;
  runDaaRefreshAndRecommendationV0: () => void;
  runDaaStatus: 'idle' | 'running' | 'ok' | 'error';
  openPreflightForRun: () => void;
  paperRunLoading: boolean;
  targetWeightsLength: number;
  executionBlockReason: string | null | undefined;
  nextJump: { targetId: string; buttonText: string };
  applySampleScenarioV0: () => void;
  sampleStatus: 'idle' | 'ok' | 'error';
  doCopyBundle: () => void;
  copyStatus: 'idle' | 'ok' | 'error';
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCancelRun: () => void;
};

export default function DaaRebalancePanelHeaderActionsV0({
  driftOverviewV0,
  rev,
  jumpTo,
  runDaaRefreshAndRecommendationV0,
  runDaaStatus,
  openPreflightForRun,
  paperRunLoading,
  targetWeightsLength,
  executionBlockReason,
  nextJump,
  applySampleScenarioV0,
  sampleStatus,
  doCopyBundle,
  copyStatus,
  open,
  setOpen,
  onCancelRun,
}: Props) {
  return (
    <>
      <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' as const }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
          <span style={{ fontWeight: 800 }}>DAA Workflow</span>
          <DaaDynamicRebalanceStatusPillV0 rev={rev} />
          {driftOverviewV0.kind === 'ok' ? (
            <span
              className="badge"
              title={driftOverviewV0.title}
              style={{
                padding: '4px 8px',
                fontSize: 11,
                borderColor: driftOverviewV0.breached ? 'var(--danger)' : '#64748b',
                color: driftOverviewV0.breached ? 'var(--danger)' : '#64748b',
                background: driftOverviewV0.breached ? 'rgba(248, 113, 113, 0.12)' : 'rgba(100, 116, 139, 0.12)',
              }}
            >
              Drift
              <span style={{ color: 'var(--muted)' }}>max|{driftOverviewV0.maxAbsText}|</span>
              <span style={{ color: 'var(--muted)' }}>{driftOverviewV0.label || '<unknown>'}</span>
            </span>
          ) : driftOverviewV0.kind === 'missing-targets' ? (
            <span
              className="badge"
              title={driftOverviewV0.title}
              style={{ padding: '4px 8px', fontSize: 11, borderColor: '#64748b', color: '#64748b', background: 'rgba(100, 116, 139, 0.12)' }}
            >
              Drift
              <span style={{ color: 'var(--muted)' }}>set targets</span>
            </span>
          ) : driftOverviewV0.kind === 'empty' ? (
            <span
              className="badge"
              title={driftOverviewV0.title}
              style={{ padding: '4px 8px', fontSize: 11, borderColor: '#64748b', color: '#64748b', background: 'rgba(100, 116, 139, 0.12)' }}
            >
              Drift
              <span style={{ color: 'var(--muted)' }}>n/a</span>
            </span>
          ) : null}
          <span className="muted" style={{ fontSize: 12 }}>
            Hub on Market/Funds: checklist + jump actions + import/export
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <Link href="/daa/dashboard" className="muted" style={{ fontSize: 12 }}>
            Dashboard
          </Link>
          <Link href="/daa/dashboard?tab=wizard&step=1" className="muted" style={{ fontSize: 12 }}>
            Wizard
          </Link>
          <button
            type="button"
            className={driftOverviewV0.kind === 'ok' && driftOverviewV0.breached ? 'button' : 'button secondary'}
            onClick={() => jumpTo('rebalance')}
            style={{ padding: '6px 10px' }}
            disabled={driftOverviewV0.kind === 'missing-targets'}
            title={driftOverviewV0.kind === 'missing-targets' ? driftOverviewV0.title : driftOverviewV0.kind === 'ok' ? driftOverviewV0.title : 'Jump to rebalance'}
          >
            Rebalance
          </button>
          <button
            type="button"
            className="button"
            onClick={() => runDaaRefreshAndRecommendationV0()}
            style={{ padding: '6px 10px' }}
            disabled={runDaaStatus === 'running'}
            title="One-click Run DAA: refresh Step2 market sources, then generate Step4 recommendation."
          >
            {runDaaStatus === 'running' ? 'Run DAA...' : 'Run DAA (refresh + recommendation)'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              runDaaRefreshAndRecommendationV0();
              openPreflightForRun();
            }}
            style={{ padding: '6px 10px' }}
            disabled={runDaaStatus === 'running' || paperRunLoading || !targetWeightsLength || !!executionBlockReason}
            title={executionBlockReason ?? 'Fast path: run DAA refresh/recommendation, then open preflight checklist.'}
          >
            {runDaaStatus === 'running' ? 'Preparing...' : 'Run + preflight'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => openPreflightForRun()}
            style={{ padding: '6px 10px' }}
            disabled={paperRunLoading || !targetWeightsLength || !!executionBlockReason}
            title={executionBlockReason ?? 'Manual trigger: open preflight and run a paper rebalance now.'}
          >
            {paperRunLoading ? 'Running...' : 'Manual run now'}
          </button>
          {paperRunLoading ? (
            <button
              type="button"
              className="button secondary"
              onClick={onCancelRun}
              style={{ padding: '6px 10px' }}
              title="Abort the in-flight paper run"
            >
              Cancel run
            </button>
          ) : null}
          <button type="button" className="button secondary" onClick={() => jumpTo(nextJump.targetId)} style={{ padding: '6px 10px' }}>
            {nextJump.buttonText}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => window.open('/daa/dashboard?tab=dashboard#history-audit', '_self')}
            style={{ padding: '6px 10px' }}
            title="Jump to dashboard history/audit for recent run inspection."
          >
            Open dashboard history
          </button>
          <button type="button" className="button secondary" onClick={applySampleScenarioV0} style={{ padding: '6px 10px' }}>
            {sampleStatus === 'ok' ? 'Loaded' : sampleStatus === 'error' ? 'Load failed' : 'Load sample scenario'}
          </button>
          <button type="button" className="button" onClick={doCopyBundle} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy bundle JSON'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen((v) => !v)}
            style={{ padding: '6px 10px' }}
            aria-expanded={open}
          >
            {open ? '收起' : '展开'}
          </button>
        </div>
      </div>
      <div className="daa-mobile-actions-v0" aria-label="Funds hub quick actions">
        <div className="daa-mobile-actions-row-v0">
          <button
            type="button"
            className="button"
            onClick={() => runDaaRefreshAndRecommendationV0()}
            disabled={runDaaStatus === 'running'}
            title="One-click Run DAA: refresh Step2 market sources, then generate Step4 recommendation."
          >
            {runDaaStatus === 'running' ? 'Run DAA...' : 'Run DAA'}
          </button>
          <button type="button" className="button secondary" onClick={() => jumpTo('rebalance')}>
            Rebalance
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => openPreflightForRun()}
            disabled={paperRunLoading || !targetWeightsLength || !!executionBlockReason}
            title={executionBlockReason ?? 'Manual trigger: open preflight and run a paper rebalance now.'}
          >
            {paperRunLoading ? 'Running...' : 'Manual run'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              runDaaRefreshAndRecommendationV0();
              openPreflightForRun();
            }}
            disabled={runDaaStatus === 'running' || paperRunLoading || !targetWeightsLength || !!executionBlockReason}
            title={executionBlockReason ?? 'Fast path: run DAA refresh/recommendation, then open preflight checklist.'}
          >
            {runDaaStatus === 'running' ? 'Preparing...' : 'Run+checklist'}
          </button>
          <button type="button" className="button secondary" onClick={() => jumpTo(nextJump.targetId)}>
            {nextJump.buttonText}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => window.open('/daa/dashboard?tab=dashboard#history-audit', '_self')}
            title="Jump to dashboard history/audit for recent run inspection."
          >
            History
          </button>
        </div>
        <div className="daa-mobile-jumps-v0">
          {MARKET_FUNDS_QUICK_JUMPS_V0.map((item) => (
            <button key={item.targetId} type="button" className="button secondary" onClick={() => jumpTo(item.targetId)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="daa-mobile-actions-spacer-v0" aria-hidden="true" />
    </>
  );
}
