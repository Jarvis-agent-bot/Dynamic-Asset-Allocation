import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v2', () => {
  it('adds net guardrail pressure summary to maxIn/maxOut what-if sandbox totals', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const netGuardrailPressure = totalMaxOutImpact - totalMaxInImpact;');
    expect(source).toContain('net pressure=<b>{(netGuardrailPressure * 100).toFixed(1)}%</b>');
  });
});
