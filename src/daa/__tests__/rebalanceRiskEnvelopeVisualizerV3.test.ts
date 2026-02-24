import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-risk-envelope-visualizer-v3', () => {
  it('adds envelope safety margin trace to risk-envelope visualizer rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const envelopeSafetyMargin = envelopeStatus === 'inside-envelope'");
    expect(source).toContain('safety margin=<b>{(r.envelopeSafetyMargin * 100).toFixed(1)}%</b>');
  });
});
