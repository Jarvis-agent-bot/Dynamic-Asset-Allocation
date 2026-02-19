import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-risk-tag-maxin-lock-center-v0', () => {
  it('adds a visible risk-tag MaxIn lock center for isolated assets', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Risk-tag MaxIn lock center');
    expect(source).toContain('Tag isolated assets and enforce physical MaxIn lock before increasing exposure.');
    expect(source).toContain("const lock = lockedIds.has(id) ? 'LOCKED_MAX_IN' : 'OPEN';");
    expect(source).toContain('maxInLock=<b style={{ color: lockColor }}>{lock}</b>');
    expect(source).toContain('rule: when tag=isolated and lock=LOCKED_MAX_IN, route buys to hold-only until operator unlocks physical limit.');
    expect(source).toContain('Apply MaxIn lock routing');
  });
});
