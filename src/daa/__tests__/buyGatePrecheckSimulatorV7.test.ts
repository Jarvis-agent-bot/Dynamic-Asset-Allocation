import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v7', () => {
  it('adds audit timeline string for top buy-gate blocker precheck evidence', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const auditTimeline = topEvidence');
    expect(source).toContain('Buy gate precheck audit timeline:');
    expect(source).toContain("auditTimeline.map((entry) => `${entry.gate}=${entry.blocked ? 'blocked' : 'pass'}");
  });
});
