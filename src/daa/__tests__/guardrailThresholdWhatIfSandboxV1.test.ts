import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v1', () => {
  it('adds aggregate maxIn/maxOut impact totals in guardrail what-if sandbox', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const totalMaxInImpact = whatIfRows.reduce((sum, r) => sum + r.maxInImpact, 0);');
    expect(source).toContain('const totalMaxOutImpact = whatIfRows.reduce((sum, r) => sum + r.maxOutImpact, 0);');
    expect(source).toContain('sandbox totals: maxIn impact=<b>{(totalMaxInImpact * 100).toFixed(1)}%</b> · maxOut impact=<b>{(totalMaxOutImpact * 100).toFixed(1)}%</b>');
  });
});
