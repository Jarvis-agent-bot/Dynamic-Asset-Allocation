import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-liquidity-cap-sensitivity-panel-v3', () => {
  it('adds execution sizing pressure traces to liquidity cap sensitivity rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const executionSizingPressurePct = capBuys > 0 ? Math.min(100, (clipAmount / capBuys) * 100) : 0;');
    expect(source).toContain("const executionSizingBand = executionSizingPressurePct >= 15 ? 'high' : executionSizingPressurePct >= 5 ? 'medium' : 'low';");
    expect(source).toContain('pressure={executionSizingPressurePct.toFixed(1)}%');
    expect(source).toContain('pressure band=<b>{executionSizingBand}</b>');
  });
});
