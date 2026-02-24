import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-liquidity-cap-sensitivity-panel-v2', () => {
  it('adds utilization and clip traces to liquidity cap sensitivity rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const capUtilizationPct = capBuys > 0 ? Math.min(200, Math.max(0, (liquiditySettlementGateV0.availableCash / capBuys) * 100)) : 100;');
    expect(source).toContain('const clipAmount = capHeadroom < 0 ? Math.abs(capHeadroom) : 0;');
    expect(source).toContain('utilization={capUtilizationPct.toFixed(1)}%');
    expect(source).toContain('clip={clipAmount.toFixed(2)}');
  });
});
