type LiveTimelineEntryV0 = { id: string; at: string; stage: string; detail: string; level: 'info' | 'ok' | 'error' };

type DaaRebalancePanelLiveSummaryV0Props = {
  open: boolean;
  headline: string;
  step1SummaryText: string;
  runDaaStatus: 'idle' | 'running' | 'ok' | 'error';
  runDaaStatusText: string;
  liveTimelineV0: LiveTimelineEntryV0[];
  timelineSummaryLabel: string;
};

export default function DaaRebalancePanelLiveSummaryV0(props: DaaRebalancePanelLiveSummaryV0Props) {
  const { open, headline, step1SummaryText, runDaaStatus, runDaaStatusText, liveTimelineV0, timelineSummaryLabel } = props;
  return (
    <div className="muted" style={{ fontSize: 12, marginBottom: open ? 12 : 0 }}>
      <div>{headline}</div>
      <div style={{ marginTop: 4 }}>{step1SummaryText}</div>
      {runDaaStatusText ? (
        <div style={{ marginTop: 4, color: runDaaStatus === 'error' ? 'var(--danger)' : runDaaStatus === 'ok' ? '#16a34a' : 'inherit' }}>
          Run DAA: {runDaaStatusText}
        </div>
      ) : null}
      {liveTimelineV0.length ? (
        <details style={{ marginTop: 8 }} open>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{timelineSummaryLabel}</summary>
          <div style={{ marginTop: 4, fontSize: 11 }}>Newest entries appear first.</div>
          <div style={{ marginTop: 2, fontSize: 11 }}>Showing {liveTimelineV0.length} recent events.</div>
          <div style={{ marginTop: 2, fontSize: 11 }}>Each event captures stage, timestamp, and status.</div>
          <div style={{ marginTop: 2, fontSize: 11 }}>Use this stream to confirm progress before staging orders.</div>
          <div style={{ marginTop: 2, fontSize: 11 }}>Errors surface in red so intervention is immediate.</div>
          <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
            {liveTimelineV0.map((e) => (
              <div key={e.id} style={{ fontSize: 11, borderLeft: `2px solid ${e.level === 'error' ? 'var(--danger)' : e.level === 'ok' ? '#16a34a' : 'rgba(127,127,127,0.6)'}`, paddingLeft: 8 }}>
                <span className="muted" style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{e.at}</span>
                {' '}· <b>{e.stage}</b> · <span style={{ color: e.level === 'error' ? 'var(--danger)' : 'inherit' }}>{e.detail}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
