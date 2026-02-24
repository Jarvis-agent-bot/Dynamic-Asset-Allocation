import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-drift-alert-f0017-v0', () => {
  it('adds a drift alert view for the guardrail-first decision flow', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Guardrail drift alert view (decision flow)');
    expect(source).toContain('const guardrailDriftAlertRows = whatIfRows.map((row) => {');
    expect(source).toContain("const guardrailDriftAlertCount = guardrailDriftAlertRows.filter((row) => row.driftAlert).length;");
    expect(source).toContain("status=<b>{row.driftAlert ? 'alert' : 'clear'}</b>");
    expect(source).toContain("drift alert verdict: alerts=<b>{guardrailDriftAlertCount}/{guardrailDriftAlertRows.length}</b> · mode=<b>{guardrailDriftAlertCount > 0 ? 'guardrail-remediation-required' : 'guardrail-flow-stable'}</b>");
  });
});
