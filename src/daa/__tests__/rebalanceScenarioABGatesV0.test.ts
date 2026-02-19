import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-scenario-a-b-gates-v0', () => {
  it('adds a visible scenario A/B gate card for strong-hold vs value-trap routing', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Rebalance scenario A/B gates');
    expect(source).toContain('Route execution by strong-hold vs value-trap decision gate.');
    expect(source).toContain("const scenario = stressScore >= 35 || deepNegativeCount >= 3 ? 'B' : 'A';");
    expect(source).toContain("const gateLabel = scenario === 'A' ? 'strong-hold gate' : 'value-trap gate';");
    expect(source).toContain("const routeLabel = scenario === 'A' ? 'route to normal rebalance execution' : 'route to defensive rebalance (trim/hedge first)';");
    expect(source).toContain('Apply gate in rebalance orders');
  });
});
