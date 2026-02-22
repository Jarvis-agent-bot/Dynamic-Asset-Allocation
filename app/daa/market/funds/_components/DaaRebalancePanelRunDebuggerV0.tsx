type DaaRebalancePanelRunDebuggerV0Props = {
  paperRunLoading: boolean;
  paperRunError: string | null;
  paperRunRecordedAt: string | null;
  targetWeightsReady: boolean;
  cashBlocked: boolean;
  blockerCount: number;
  onFixTargets: () => void;
  onRefreshPrices: () => void;
  onOpenGuidedRecovery: () => void;
  onCopyDiagnostics: () => void;
};

export default function DaaRebalancePanelRunDebuggerV0(props: DaaRebalancePanelRunDebuggerV0Props) {
  const { paperRunLoading, paperRunError, paperRunRecordedAt, targetWeightsReady, cashBlocked, blockerCount, onFixTargets, onRefreshPrices, onOpenGuidedRecovery, onCopyDiagnostics } = props;
  const runStatus = paperRunLoading ? 'running' : paperRunError ? 'error' : paperRunRecordedAt ? 'recorded' : 'idle';

  return (
    <details style={{ marginTop: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, background: 'rgba(0,0,0,0.1)' }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Run debugger · {runStatus}</summary>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        <div className="muted" style={{ fontSize: 11 }}>
          One-click diagnostics + guided recovery actions for the current run state.
        </div>
        <div style={{ fontSize: 11 }}>
          <b>Status</b>: {runStatus}
          {' '}· <b>Targets</b>: {targetWeightsReady ? 'ready' : 'missing'}
          {' '}· <b>Cash</b>: {cashBlocked ? 'blocked' : 'ok'}
          {' '}· <b>Blockers</b>: {blockerCount}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {([
            { key: 'targets', label: 'Fix targets', onClick: onFixTargets, disabled: false },
            { key: 'prices', label: 'Refresh prices', onClick: onRefreshPrices, disabled: false },
            { key: 'recovery', label: 'Open guided recovery', onClick: onOpenGuidedRecovery, disabled: paperRunLoading },
          ] as const).map((action) => (
            <button key={action.key} type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </button>
          ))}
          <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onCopyDiagnostics}>
            Copy diagnostics
          </button>
        </div>
      </div>
    </details>
  );
}
