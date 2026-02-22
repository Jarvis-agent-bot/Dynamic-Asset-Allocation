type DaaRebalanceDriftWithinThresholdHintV0Props = {
  breachCount: number;
};

export default function DaaRebalanceDriftWithinThresholdHintV0({ breachCount }: DaaRebalanceDriftWithinThresholdHintV0Props) {
  return (
    <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
      Drift is within threshold ({breachCount} breaches). Suggested action: keep monitoring or lower threshold for tighter control.
    </div>
  );
}
