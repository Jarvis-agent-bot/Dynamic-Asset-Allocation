type DaaRebalancePreRunViolationItemV0Props = {
  level: 'blocker' | 'warning' | 'info';
  title: string;
  details: string[];
  suggestion?: string;
};

export default function DaaRebalancePreRunViolationItemV0({ level, title, details, suggestion }: DaaRebalancePreRunViolationItemV0Props) {
  const color = level === 'blocker' ? 'var(--danger)' : level === 'warning' ? '#f59e0b' : '#38bdf8';

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>
        {level.toUpperCase()}: {title} ({details.length} details)
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {details.join(' ')}
      </div>
      {suggestion ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Suggestion: {suggestion}
        </div>
      ) : null}
    </div>
  );
}
