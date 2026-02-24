import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-risk-envelope-visualizer-v4', () => {
  it('adds envelope pressure score/tier trace to risk-envelope visualizer rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const envelopePressureScore = r.envelopeStatus === 'outside-envelope'");
    expect(source).toContain("const envelopePressureTier = envelopePressureScore >= 0.75 ? 'high' : envelopePressureScore >= 0.4 ? 'medium' : 'low';");
    expect(source).toContain('pressure score=<b>{envelopePressureScore.toFixed(2)}</b> · pressure tier=<b>{envelopePressureTier}</b>');
  });
});
