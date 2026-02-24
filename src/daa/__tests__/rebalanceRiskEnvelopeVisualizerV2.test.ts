import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-risk-envelope-visualizer-v2', () => {
  it('adds envelope utilization percentage to risk-envelope visualizer rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const envelopeUtilizationPct = r.envelopeUpper > r.envelopeLower');
    expect(source).toContain('utilization=<b>{envelopeUtilizationPct.toFixed(0)}%</b>');
  });
});
