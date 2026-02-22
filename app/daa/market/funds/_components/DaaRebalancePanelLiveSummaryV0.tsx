import type { LiveTimelineEntryV0 } from './DaaRebalancePanel.liveTimelineV0';
import DaaRebalancePanelLiveTimelineListV0 from './DaaRebalancePanelLiveTimelineListV0';

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
          <DaaRebalancePanelLiveTimelineListV0 liveTimelineV0={liveTimelineV0} />
        </details>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11 }}>Live execution events will appear here after Run DAA starts.</div>
      )}
    </div>
  );
}
