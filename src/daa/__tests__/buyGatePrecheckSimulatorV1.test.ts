import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v1', () => {
  it('adds blocked gate count summary to buy precheck simulator verdicts', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const blockedGateCount = [incompetenceGate, maxInGate, liquidityGate, settlementGate].filter(Boolean).length;');
    expect(source).toContain("const verdict = blockedGateCount > 0 ? 'blocked' : 'ready';");
    expect(source).toContain('blocked gates=<b>{blockedGateCount}</b> => <b>{verdict}</b>');
  });
});
