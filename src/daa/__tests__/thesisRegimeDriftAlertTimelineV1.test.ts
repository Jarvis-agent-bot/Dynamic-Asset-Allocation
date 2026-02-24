import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-thesis-regime-drift-alert-timeline-v1', () => {
  it('adds down-weight delta percentage to thesis-regime drift timeline', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const downWeightDeltaPct = thesisRegimeDrift ? (1 - downWeightFactor) * 100 : 0;');
    expect(source).toContain('down-weight delta=<b>{r.downWeightDeltaPct.toFixed(1)}%</b>');
  });
});
