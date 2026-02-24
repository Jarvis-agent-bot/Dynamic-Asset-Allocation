import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-wqat-multiplier-explainer-card-v3', () => {
  it('adds formula contribution trace for W_qat multiplier explainer card', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Formula contribution trace: quality drag=<b>{((1 - explainerExample.quality) * 100).toFixed(1)}pp</b>');
    expect(source).toContain('tier lift=<b>{((explainerExample.analystTierMultiplier - 1) * 100).toFixed(1)}pp</b>');
    expect(source).toContain('net multiplier=<b>{(explainerExample.quality * explainerExample.analystTierMultiplier).toFixed(3)}</b>');
  });
});
