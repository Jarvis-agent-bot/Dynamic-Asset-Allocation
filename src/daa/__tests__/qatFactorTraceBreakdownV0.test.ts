import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v0', () => {
  it('exposes W_qat factor breakdown panel with gate-level trace values', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('QAT weight-adjusted targets (W_qat)');
    expect(source).toContain('const driftGatePenalty = Math.min(0.35, driftAbs * 1.8);');
    expect(source).toContain('const missingGatePenalty = missingSet.has(id) ? 0.2 : 0;');
    expect(source).toContain('const staleGatePenalty = staleSet.has(id) ? 0.1 : 0;');
    expect(source).toContain('gates(drift=-{(r.driftGatePenalty * 100).toFixed(1)}pp, missing=-{(r.missingGatePenalty * 100).toFixed(1)}pp, stale=-{(r.staleGatePenalty * 100).toFixed(1)}pp)');
  });
});
