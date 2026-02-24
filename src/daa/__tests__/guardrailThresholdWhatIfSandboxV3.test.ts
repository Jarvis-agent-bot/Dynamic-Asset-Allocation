import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v3', () => {
  it('adds net-pressure bias label in guardrail what-if sandbox totals', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const pressureBias = netGuardrailPressure > 0 ? 'maxOut-heavy' : netGuardrailPressure < 0 ? 'maxIn-heavy' : 'balanced';");
    expect(source).toContain('bias=<b>{pressureBias}</b>');
  });
});
