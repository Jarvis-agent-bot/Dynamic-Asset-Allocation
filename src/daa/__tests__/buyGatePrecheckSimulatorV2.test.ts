import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v2', () => {
  it('adds deterministic primary blocker trace in buy precheck simulator rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const primaryBlocker = incompetenceGate');
    expect(source).toContain("? 'incompetence'");
    expect(source).toContain("? 'T+N'");
    expect(source).toContain('primary blocker=<b>{primaryBlocker}</b>');
  });
});
