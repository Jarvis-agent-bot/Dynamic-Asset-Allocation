import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-black-swan-consensus-warning-v0', () => {
  it('adds a black-swan consensus warning when elite cohort shifts to defense', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Black-swan consensus warning');
    expect(source).toContain('Warn when elite cohort consensus shifts from offense to defense.');
    expect(source).toContain('const consensusDefense = defenseVotes >= 2;');
    expect(source).toContain("consensusDefense ? 'defense shift detected' : 'stable risk posture'");
    expect(source).toContain('cohort: {eliteSignals.map((s) => `${s.name}:${s.defensive ? \'defense\' : \'offense\'}`).join(\' · \')}');
    expect(source).toContain('Switch to defensive routing');
  });
});
