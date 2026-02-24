import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v4', () => {
  it('adds net-pressure severity label in guardrail what-if sandbox totals', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const pressureSeverity = Math.abs(netGuardrailPressure) >= 0.03 ? 'elevated' : Math.abs(netGuardrailPressure) >= 0.015 ? 'watch' : 'normal';");
    expect(source).toContain('severity=<b>{pressureSeverity}</b>');
  });
});
