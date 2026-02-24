import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v6', () => {
  it('adds unblock hint guidance to each buy precheck row', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const unblockHint = primaryBlocker === 'incompetence'");
    expect(source).toContain("? 'reduce drift or reassess thesis'");
    expect(source).toContain("'unlock MaxIn limit'");
    expect(source).toContain('unblock hint=<b>{unblockHint}</b>');
  });
});
