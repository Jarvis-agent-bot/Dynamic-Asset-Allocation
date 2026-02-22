import { fmtPct01 } from './DaaRebalancePanel.helpersV0';

type DaaRebalanceDriftAlertHeaderV0Props = {
  breached: boolean;
  breachCount: number;
  loading: boolean;
  source: string;
  at: string;
  maxAbsDriftPct: number;
  maxAbsDriftSymbol: string | null;
  thresholdPct: number;
  shouldRebalance?: boolean;
};

export default function DaaRebalanceDriftAlertHeaderV0(props: DaaRebalanceDriftAlertHeaderV0Props) {
  const { breached, breachCount, loading, source, at, maxAbsDriftPct, maxAbsDriftSymbol, thresholdPct, shouldRebalance } = props;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: breached ? 'var(--danger)' : 'var(--muted)' }}>
          Live drift alerts ({breachCount})
          {loading ? <span className="muted" style={{ marginLeft: 6, fontWeight: 500 }}>(running...)</span> : null}
        </div>
        <div className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular' }}>
          {source} @ {at}
        </div>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: breached ? 'var(--danger)' : 'var(--text)' }}>
        maxAbsDrift={fmtPct01(maxAbsDriftPct)}
        {maxAbsDriftSymbol ? ` (${maxAbsDriftSymbol})` : ''}; threshold={fmtPct01(thresholdPct)}
        {shouldRebalance !== undefined ? `; shouldRebalance=${String(shouldRebalance)}` : ''}
      </div>
    </>
  );
}
