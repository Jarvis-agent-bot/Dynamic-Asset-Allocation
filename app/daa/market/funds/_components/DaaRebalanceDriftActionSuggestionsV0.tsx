type DaaRebalanceDriftActionSuggestionsV0Props = {
  onOpenPreflight: () => void;
  onReviewTargetWeights: () => void;
  onTuneThreshold: () => void;
};

export default function DaaRebalanceDriftActionSuggestionsV0(props: DaaRebalanceDriftActionSuggestionsV0Props) {
  const { onOpenPreflight, onReviewTargetWeights, onTuneThreshold } = props;

  return (
    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
      <span className="muted" style={{ fontSize: 11 }}>Threshold-based action suggestions (3):</span>
      <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onOpenPreflight}>
        Open preflight checklist
      </button>
      <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onReviewTargetWeights}>
        Review target weights
      </button>
      <button type="button" className="button secondary" style={{ padding: '4px 8px' }} onClick={onTuneThreshold}>
        Tighten/relax threshold
      </button>
    </div>
  );
}
