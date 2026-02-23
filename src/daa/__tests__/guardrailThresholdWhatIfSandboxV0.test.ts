import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v0', () => {
  it('adds guardrail threshold what-if sandbox for maxIn/maxOut impacts', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Guardrail threshold what-if sandbox (maxIn/maxOut impacts)');
    expect(source).toContain('const maxInThreshold = 0.03;');
    expect(source).toContain('const maxOutThreshold = 0.04;');
    expect(source).toContain('const maxInImpact = drift < 0 ? Math.max(0, Math.abs(drift) - maxInThreshold) : 0;');
    expect(source).toContain('const maxOutImpact = drift > 0 ? Math.max(0, Math.abs(drift) - maxOutThreshold) : 0;');
    expect(source).toContain("maxIn impact={r.maxInImpact > 0 ? `+${(r.maxInImpact * 100).toFixed(1)}%` : '0.0%'}");
    expect(source).toContain("maxOut impact={r.maxOutImpact > 0 ? `+${(r.maxOutImpact * 100).toFixed(1)}%` : '0.0%'}");
  });
});
