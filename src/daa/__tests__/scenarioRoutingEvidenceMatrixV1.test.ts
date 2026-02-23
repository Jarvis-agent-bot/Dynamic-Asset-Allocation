import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-test-evidence-matrix-v1', () => {
  it('adds evidence matrix vote snapshot and consensus for A/B routing', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const bPathVotes = [');
    expect(source).toContain('const aPathVotes = 4 - bPathVotes;');
    expect(source).toContain("const matrixConsensus = bPathVotes >= 2 ? 'B-path pressure' : 'A-path stable';");
    expect(source).toContain('evidence matrix votes: A=<b>{aPathVotes}</b> · B=<b>{bPathVotes}</b> · consensus=<b>{matrixConsensus}</b>');
  });
});
