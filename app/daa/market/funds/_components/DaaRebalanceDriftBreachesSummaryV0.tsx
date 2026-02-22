type DriftBreachV0 = { id: string; label: string; driftPct: number };

type DaaRebalanceDriftBreachesSummaryV0Props = {
  breaches: DriftBreachV0[];
};

export default function DaaRebalanceDriftBreachesSummaryV0({ breaches }: DaaRebalanceDriftBreachesSummaryV0Props) {
  if (!breaches.length) return <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>No symbols exceed the drift threshold.</div>;

  return (
    <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
      Breaches ({breaches.length}):{' '}
      {breaches.map((b) => `${b.label}(${b.id}) ${b.driftPct >= 0 ? '+' : ''}${(b.driftPct * 100).toFixed(1)}%`).join(' · ')}
    </div>
  );
}
