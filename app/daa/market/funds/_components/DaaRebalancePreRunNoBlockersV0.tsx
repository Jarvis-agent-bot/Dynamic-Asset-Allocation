type DaaRebalancePreRunNoBlockersV0Props = {
  warningCount: number;
};

export default function DaaRebalancePreRunNoBlockersV0({ warningCount }: DaaRebalancePreRunNoBlockersV0Props) {
  return (
    <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
      No blockers detected for current inputs (0 blockers, {warningCount} warnings).
    </div>
  );
}
