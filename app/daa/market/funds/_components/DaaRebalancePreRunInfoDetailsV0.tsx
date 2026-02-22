type PreRunViolationInfoV0 = { kind: string; title: string; details: string[] };

type DaaRebalancePreRunInfoDetailsV0Props = {
  infoViolations: PreRunViolationInfoV0[];
};

export default function DaaRebalancePreRunInfoDetailsV0({ infoViolations }: DaaRebalancePreRunInfoDetailsV0Props) {
  if (!infoViolations.length) return null;

  return (
    <details className="muted" style={{ marginTop: 10, fontSize: 11 }}>
      <summary style={{ cursor: 'pointer' }}>More details ({infoViolations.length})</summary>
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {infoViolations.map((v, idx) => (
          <div key={`info-${v.kind}-${idx}`}>
            <div style={{ fontWeight: 700 }}>{v.title}</div>
            <div style={{ marginTop: 4 }}>{v.details.join(' ')}</div>
          </div>
        ))}
      </div>
    </details>
  );
}
