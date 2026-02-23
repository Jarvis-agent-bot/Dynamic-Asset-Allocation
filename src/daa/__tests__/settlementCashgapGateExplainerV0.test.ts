import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-settlement-cashgap-gate-explainer-v0', () => {
  it('adds T+N settlement and cash-gap gate explainer panel with deterministic reason text', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('T+N settlement and cash-gap gate explainer');
    expect(source).toContain('const settlementBlocked = liquiditySettlementGateV0.settlementLagDays > 1;');
    expect(source).toContain('const cashGapBlocked = liquiditySettlementGateV0.cashGap > 0;');
    expect(source).toContain("settlement gate(T+N={liquiditySettlementGateV0.settlementLagDays})={settlementBlocked ? 'block' : 'pass'}");
    expect(source).toContain('explanation=<b>{gateReason}</b>');
  });
});
