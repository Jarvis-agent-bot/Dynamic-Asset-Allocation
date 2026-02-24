import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v5', () => {
  it('adds gate block score and readiness percentage to each buy precheck row', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const gateBlockScore = blockedGateCount / 4;');
    expect(source).toContain('const readinessPct = Math.round((1 - gateBlockScore) * 100);');
    expect(source).toContain('gate block score=<b>{gateBlockScore.toFixed(2)}</b> · readiness=<b>{readinessPct}%</b>');
  });
});
