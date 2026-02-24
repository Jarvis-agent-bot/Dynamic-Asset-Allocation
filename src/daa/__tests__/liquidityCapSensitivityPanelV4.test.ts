import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-liquidity-cap-sensitivity-panel-v4', () => {
  it('adds sizing action and suggested scale traces to liquidity cap sensitivity rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const sizingAction = capCoverage >= 1 ? 'hold size' : capCoverage >= 0.9 ? 'trim lightly' : 'trim aggressively';");
    expect(source).toContain('const suggestedScalePct = capCoverage >= 1 ? 100 : Math.max(0, Math.min(100, capCoverage * 100));');
    expect(source).toContain('action=<b>{sizingAction}</b>');
    expect(source).toContain('suggested scale=<b>{suggestedScalePct.toFixed(1)}%</b>');
  });
});
