import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-wqat-multiplier-explainer-card-v1', () => {
  it('adds ordered formula trace steps to W_qat multiplier explainer card', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('W_qat multiplier explainer:');
    expect(source).toContain('Formula trace order:');
    expect(source).toContain('1) derive Q');
    expect(source).toContain('2) apply analyst tier multiplier');
    expect(source).toContain('3) finalize recommendation preview weight');
  });
});
