import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-scenario-a-b-gates-v0', () => {
  it('keeps a visible scenario A/B gate card with an explicit routing rule', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Rebalance scenario A/B gates');
    expect(source).toContain('Route execution by strong-hold vs value-trap decision gate.');
    expect(source).toContain('deriveScenarioRoutingV0');
    expect(source).toContain('explicit rule: scenario B when stress score ≥');
    expect(source).toContain('Apply gate in rebalance orders');
  });
});
