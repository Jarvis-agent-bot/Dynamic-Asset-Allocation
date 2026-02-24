import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-risk-envelope-visualizer-v5', () => {
  it('adds operator action trace to risk-envelope visualizer rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const envelopeAction = r.envelopeStatus === 'outside-envelope'");
    expect(source).toContain("? 'rebalance now'");
    expect(source).toContain("pressure tier=<b>{envelopePressureTier}</b> · action=<b>{envelopeAction}</b>");
  });
});
