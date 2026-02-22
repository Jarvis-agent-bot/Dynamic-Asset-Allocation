import type { LiveTimelineEntryV0 } from './DaaRebalancePanel.liveTimelineV0';

type DaaRebalancePanelLiveTimelineListV0Props = {
  liveTimelineV0: LiveTimelineEntryV0[];
};

export default function DaaRebalancePanelLiveTimelineListV0({ liveTimelineV0 }: DaaRebalancePanelLiveTimelineListV0Props) {
  return (
    <>
      <div style={{ marginTop: 4, fontSize: 11 }}>Showing {liveTimelineV0.length} recent events.</div>
      <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
        {liveTimelineV0.map((e) => (
          <div key={e.id} style={{ fontSize: 11, borderLeft: `2px solid ${e.level === 'error' ? 'var(--danger)' : e.level === 'ok' ? '#16a34a' : 'rgba(127,127,127,0.6)'}`, paddingLeft: 8 }}>
            <span className="muted" style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{e.at}</span>
            {' '}· <b>{e.stage}</b> · <span style={{ color: e.level === 'error' ? 'var(--danger)' : 'inherit' }}>{e.detail}</span>
          </div>
        ))}
      </div>
    </>
  );
}
