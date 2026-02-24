import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v5', () => {
  it('adds gate-level trace panel with aggregate and average W_qat penalties', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('W_qat factor breakdown panel (gate-level trace)');
    expect(source).toContain('avg gate penalties: drift=');
    expect(source).toContain('aggregate gate penalties: drift=');
    expect(source).toContain('const gateLevelTraceTotals = qatRows.reduce(');
  });
});
