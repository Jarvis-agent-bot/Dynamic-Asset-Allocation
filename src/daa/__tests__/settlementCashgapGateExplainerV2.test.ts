import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-settlement-cashgap-gate-explainer-v2', () => {
  it('adds gate score and unblock cash traces to settlement cash-gap explainer', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const settlementPenaltyPts = settlementBlocked ? Math.min(40, liquiditySettlementGateV0.settlementLagDays * 10) : 0;');
    expect(source).toContain('const cashGapPenaltyPts = cashGapBlocked ? Math.min(60, Math.max(5, liquiditySettlementGateV0.cashGap / 1000)) : 0;');
    expect(source).toContain('const gateScore = Math.max(0, 100 - settlementPenaltyPts - cashGapPenaltyPts);');
    expect(source).toContain('const unblockCashNeeded = cashGapBlocked ? liquiditySettlementGateV0.cashGap : 0;');
    expect(source).toContain('gate score=<b>{gateScore.toFixed(1)}</b>');
    expect(source).toContain('unblock cash=<b>{unblockCashNeeded.toFixed(2)} {baseCcy || \'\'}</b>');
  });
});
