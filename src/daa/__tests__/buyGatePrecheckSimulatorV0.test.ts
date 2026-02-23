import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v0', () => {
  it('adds buy precheck simulator covering incompetence, maxIn, liquidity, and T+N gates', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Buy gate precheck simulator (incompetence / MaxIn / liquidity / T+N)');
    expect(source).toContain('const incompetenceGate = Math.abs(r.deltaPct) >= Math.max(driftThresholdPct * 2.2, 0.06);');
    expect(source).toContain('const maxInGate = lockedIds.has(id);');
    expect(source).toContain('const liquidityGate = liquiditySettlementGateV0.blocked || preTradeCashCheck.blocking;');
    expect(source).toContain('const settlementGate = liquiditySettlementGateV0.settlementLagDays > 1;');
    expect(source).toContain("incompetence={incompetenceGate ? 'block' : 'pass'} · maxIn={maxInGate ? 'block' : 'pass'} · liquidity={liquidityGate ? 'block' : 'pass'} · T+N={settlementGate ? 'block' : 'pass'} => <b>{verdict}</b>");
  });
});
