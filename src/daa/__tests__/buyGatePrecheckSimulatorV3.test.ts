import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v3', () => {
  it('adds blocker severity trace to buy precheck simulator rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const blockerSeverity = blockedGateCount >= 3 ? 'critical' : blockedGateCount === 2 ? 'high' : blockedGateCount === 1 ? 'medium' : 'none';");
    expect(source).toContain('severity=<b>{blockerSeverity}</b>');
  });
});
