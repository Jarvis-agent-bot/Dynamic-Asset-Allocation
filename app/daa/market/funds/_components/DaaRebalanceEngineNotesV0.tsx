type DaaRebalanceEngineNotesV0Props = {
  notes: string[];
};

export default function DaaRebalanceEngineNotesV0({ notes }: DaaRebalanceEngineNotesV0Props) {
  if (!notes.length) return null;

  return (
    <details className="muted" style={{ marginTop: 10, fontSize: 12 }}>
      <summary style={{ cursor: 'pointer' }}>Engine notes ({notes.length})</summary>
      <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
        {notes.slice(0, 10).map((n, idx) => (
          <div key={idx}>{n}</div>
        ))}
      </div>
      {notes.length > 10 ? (
        <div style={{ fontSize: 11, marginTop: 6 }}>+{notes.length - 10} more notes...</div>
      ) : null}
    </details>
  );
}
