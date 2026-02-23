import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-evidence-panel-v0', () => {
  it('adds scenario-routing evidence panel with gate statuses and trigger reasons', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Rebalance scenario A/B gates');
    expect(source).toContain('Route execution by strong-hold vs value-trap decision gate.');
    expect(source).toContain('deriveScenarioRoutingV0');
    expect(source).toContain('Scenario-routing evidence: policy-gate=');
    expect(source).toContain('data-quality-gate=');
    expect(source).toContain('deep-negative-gate=');
    expect(source).toContain('trigger reason:');
    expect(source).toContain('Apply gate in rebalance orders');
  });
});
