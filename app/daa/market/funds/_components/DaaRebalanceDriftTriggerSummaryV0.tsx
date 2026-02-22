type DaaRebalanceDriftTriggerSummaryV0Props = {
  reasons: string[];
  eligibleOrderCount?: number;
};

export default function DaaRebalanceDriftTriggerSummaryV0({ reasons, eligibleOrderCount }: DaaRebalanceDriftTriggerSummaryV0Props) {
  if (!reasons.length) return null;

  return (
    <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
      Trigger reasons ({reasons.length}): {reasons.slice(0, 3).join('; ')}
      {eligibleOrderCount !== undefined ? `; eligibleOrders=${eligibleOrderCount}` : ''}
    </div>
  );
}
