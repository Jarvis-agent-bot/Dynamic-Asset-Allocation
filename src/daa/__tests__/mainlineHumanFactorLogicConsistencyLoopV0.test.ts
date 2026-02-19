import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-build-human-factor-evaluation-and-logic-consistency-loop-v0', () => {
  it('adds a visible human-factor + logic-consistency loop card', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Human-factor + logic-consistency loop');
    expect(source).toContain('Evaluate analyst behavior and logic consistency in one closed feedback loop.');
    expect(source).toContain('const loopStatus = humanFactorScore >= 70 && logicConsistencyScore >= 70 ? \'stable loop\' : \'needs intervention\';');
    expect(source).toContain('human-factor=<b>{humanFactorScore}</b> · logic-consistency=<b>{logicConsistencyScore}</b>');
    expect(source).toContain('Resolve thesis consistency');
    expect(source).toContain('Re-run human-factor preflight');
  });
});
