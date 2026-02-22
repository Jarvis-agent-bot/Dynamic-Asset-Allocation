export type IntegratedDecisionWorkbenchInputV0 = {
  id: string;
  targetPct: number;
  deltaPct: number;
  thresholdPct: number;
  isMissingPrice: boolean;
  isStalePrice: boolean;
  hasGuardrailBlocker: boolean;
};

export type IntegratedDecisionWorkbenchRowV0 = {
  id: string;
  humanTag: 'trusted' | 'watchlist' | 'blocked';
  thresholdStatus: 'inside' | 'breach';
  suggestion: 'buy' | 'sell' | 'hold';
  riskConstraint: 'ok' | 'blocked';
  constraintReason: string;
};

export function buildIntegratedDecisionWorkbenchRowV0(input: IntegratedDecisionWorkbenchInputV0): IntegratedDecisionWorkbenchRowV0 {
  const drift = Number.isFinite(input.deltaPct) ? input.deltaPct : 0;
  const threshold = Math.max(0, Number.isFinite(input.thresholdPct) ? input.thresholdPct : 0);
  const driftAbs = Math.abs(drift);
  const thresholdStatus: IntegratedDecisionWorkbenchRowV0['thresholdStatus'] = driftAbs >= threshold && threshold > 0 ? 'breach' : 'inside';

  const hasDataRisk = input.isMissingPrice || input.isStalePrice;
  const riskConstraint: IntegratedDecisionWorkbenchRowV0['riskConstraint'] = input.hasGuardrailBlocker || hasDataRisk ? 'blocked' : 'ok';
  const humanTag: IntegratedDecisionWorkbenchRowV0['humanTag'] = input.isMissingPrice
    ? 'blocked'
    : input.isStalePrice
      ? 'watchlist'
      : 'trusted';

  let suggestion: IntegratedDecisionWorkbenchRowV0['suggestion'] = 'hold';
  if (thresholdStatus === 'breach') {
    suggestion = drift < 0 ? 'buy' : 'sell';
  }
  if (riskConstraint === 'blocked') {
    suggestion = 'hold';
  }

  const constraintReason = input.hasGuardrailBlocker
    ? 'guardrail blocker'
    : input.isMissingPrice
      ? 'missing price'
      : input.isStalePrice
        ? 'stale price'
        : 'clear';

  return {
    id: String(input.id || '').trim(),
    humanTag,
    thresholdStatus,
    suggestion,
    riskConstraint,
    constraintReason,
  };
}
