import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-wqat-multiplier-explainer-card-v2', () => {
  it('adds worked example formula trace to W_qat multiplier explainer card', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Worked example (');
    expect(source).toContain('preview weight.');
    expect(source).toContain('explainerExample.analystTierMultiplier.toFixed(2)');
  });
});
