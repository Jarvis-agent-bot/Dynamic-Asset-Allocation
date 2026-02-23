import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v1', () => {
  it('adds total gate penalty and severity tier to W_qat gate-level factor trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const gatePenaltyTotal = driftGatePenalty + missingGatePenalty + staleGatePenalty;');
    expect(source).toContain("const gatePenaltyTier = gatePenaltyTotal >= 0.35 ? 'heavy' : gatePenaltyTotal >= 0.2 ? 'medium' : 'light';");
    expect(source).toContain("total=-{(r.gatePenaltyTotal * 100).toFixed(1)}pp");
    expect(source).toContain('tier=<b>{r.gatePenaltyTier}</b>');
  });
});
