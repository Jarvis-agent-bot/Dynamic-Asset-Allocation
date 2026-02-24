import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-settlement-cashgap-gate-explainer-v1', () => {
  it('adds deterministic gate severity to settlement/cash-gap explainer', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const gateSeverity = settlementBlocked && cashGapBlocked ? 'high' : settlementBlocked || cashGapBlocked ? 'medium' : 'none';");
    expect(source).toContain('severity=<b>{gateSeverity}</b>');
  });
});
