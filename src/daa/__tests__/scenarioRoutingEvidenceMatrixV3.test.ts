import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-test-evidence-matrix-v3', () => {
  it('adds consensus strength percentage to scenario routing evidence matrix', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const consensusStrengthPct = Math.round((Math.max(aPathVotes, bPathVotes) / 4) * 100);');
    expect(source).toContain('strength=<b>{consensusStrengthPct}%</b>');
  });
});
