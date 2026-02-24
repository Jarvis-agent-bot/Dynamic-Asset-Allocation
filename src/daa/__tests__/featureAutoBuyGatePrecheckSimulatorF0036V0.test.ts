import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-precheck-simulator-f0036-v0', () => {
  it('adds blocker consensus summary to buy-gate precheck simulator', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const blockerConsensus = precheckRows.reduce(');
    expect(source).toContain("const dominantBlocker = blockerConsensus.incompetence >= blockerConsensus.maxIn");
    expect(source).toContain('precheck blocker consensus: dominant blocker=<b>{dominantBlocker}</b> · hits=<b>{dominantBlockerHits}</b>');
  });
});
