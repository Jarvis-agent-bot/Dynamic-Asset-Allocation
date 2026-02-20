import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-maxin-maxout-limits-v0', () => {
  it('adds visible MaxIn/MaxOut limits with breach trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('MaxIn / MaxOut limits');
    expect(source).toContain('Clamp per-symbol move sizes before routing execution.');
    expect(source).toContain('const maxInPct = 0.04;');
    expect(source).toContain('const maxOutPct = 0.05;');
    expect(source).toContain("drift={(x.drift * 100).toFixed(1)}% exceeds {x.side === 'in' ? 'MaxIn' : 'MaxOut'} {(x.limit * 100).toFixed(1)}%");
  });
});
