import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-liquidity-cap-sensitivity-panel-v1', () => {
  it('adds cash headroom trace to liquidity cap sensitivity panel rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const capHeadroom = liquiditySettlementGateV0.availableCash - capBuys;');
    expect(source).toContain('headroom={capHeadroom.toFixed(2)}');
  });
});
