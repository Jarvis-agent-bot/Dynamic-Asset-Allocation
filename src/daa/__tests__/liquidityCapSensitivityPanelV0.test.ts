import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-liquidity-cap-sensitivity-panel-v0', () => {
  it('adds liquidity cap sensitivity panel for execution sizing outcomes', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Liquidity cap sensitivity panel (execution sizing)');
    expect(source).toContain('([0.8, 1.0, 1.2] as const).map((cap) => {');
    expect(source).toContain('const capBuys = liquiditySettlementGateV0.estimatedBuys * cap;');
    expect(source).toContain('const capCoverage = capBuys > 0 ? liquiditySettlementGateV0.availableCash / capBuys : 1;');
    expect(source).toContain("const capVerdict = capCoverage >= 1 ? 'sized' : 'clipped';");
    expect(source).toContain('cap x{cap.toFixed(1)}: planned buy={capBuys.toFixed(2)} · cash coverage={capCoverage.toFixed(2)}');
  });
});
