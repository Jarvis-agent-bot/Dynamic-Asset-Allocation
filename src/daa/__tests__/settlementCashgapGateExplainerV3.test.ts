import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-settlement-cashgap-gate-explainer-v3', () => {
  it('adds earliest clearance and next action traces to settlement cash-gap explainer', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const earliestClearanceDays = settlementBlocked ? liquiditySettlementGateV0.settlementLagDays - 1 : 0;');
    expect(source).toContain("const nextOperatorAction = settlementBlocked && cashGapBlocked");
    expect(source).toContain('earliest clearance=<b>T+{earliestClearanceDays}</b>');
    expect(source).toContain('next action=<b>{nextOperatorAction}</b>');
  });
});
