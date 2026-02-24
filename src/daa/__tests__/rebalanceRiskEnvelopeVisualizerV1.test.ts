import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-risk-envelope-visualizer-v1', () => {
  it('adds breach-distance trace to risk-envelope visualizer rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const envelopeBreachDistance = drift < envelopeLower');
    expect(source).toContain('breach distance=<b>{(r.envelopeBreachDistance * 100).toFixed(1)}%</b>');
  });
});
