import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v6', () => {
  it('adds peak-impact row and score summary to what-if sandbox totals', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const peakImpactRow = whatIfRows.reduce((best, row) => {');
    expect(source).toContain('const peakImpactScorePct = (peakImpactRow.maxInImpact + peakImpactRow.maxOutImpact) * 100;');
    expect(source).toContain("peak impact row=<b>{peakImpactRow.id || 'n/a'}</b> · peak impact score=<b>{peakImpactScorePct.toFixed(1)}%</b>");
  });
});
