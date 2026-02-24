import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v4', () => {
  it('adds confidence band to W_qat factor trace rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const traceConfidenceBand = effectiveMultiplier >= 0.95 ? 'strong' : effectiveMultiplier >= 0.8 ? 'moderate' : 'weak';");
    expect(source).toContain('confidence band=<b>{traceConfidenceBand}</b>');
  });
});
