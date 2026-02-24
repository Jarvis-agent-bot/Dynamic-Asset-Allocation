import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-thesis-regime-drift-alert-timeline-v3', () => {
  it('adds thesis threshold and rationale code trace to drift alert timeline rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const thesisRegimeThreshold = Math.max(driftThresholdPct * 1.8, 0.05);');
    expect(source).toContain("const downWeightRationaleCode = thesisRegimeDrift ? `REGIME_DRIFT_${driftSeverity.toUpperCase()}` : 'REGIME_STABLE';");
    expect(source).toContain('threshold=<b>{(r.thesisRegimeThreshold * 100).toFixed(1)}%</b>');
    expect(source).toContain('rationale code=<b>{r.downWeightRationaleCode}</b>');
  });
});
