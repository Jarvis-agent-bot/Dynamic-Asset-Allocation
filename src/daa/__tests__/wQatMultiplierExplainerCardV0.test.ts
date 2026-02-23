import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-wqat-multiplier-explainer-card-v0', () => {
  it('adds W_qat multiplier explainer card with formula trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('W_qat multiplier explainer:');
    expect(source).toContain('W_qat = W_target × Q × analystTierMultiplier');
    expect(source).toContain('Q = 1 - driftPenalty - missingPenalty - stalePenalty');
  });
});
