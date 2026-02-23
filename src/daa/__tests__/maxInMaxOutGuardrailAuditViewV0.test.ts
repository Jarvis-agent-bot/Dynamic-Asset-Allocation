import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-maxin-maxout-guardrail-audit-view-v0', () => {
  it('adds maxin/maxout guardrail audit view with deterministic threshold trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('MaxIn/MaxOut guardrail audit view (threshold trace)');
    expect(source).toContain('const maxInThresholdHit = r.maxInImpact > 0;');
    expect(source).toContain('const maxOutThresholdHit = r.maxOutImpact > 0;');
    expect(source).toContain("const guardrailAuditVerdict = maxInThresholdHit || maxOutThresholdHit ? 'threshold-breached' : 'threshold-safe';");
    expect(source).toContain('maxIn threshold={maxInThreshold.toFixed(2)} ({maxInThresholdHit ? \'hit\' : \'safe\'})');
    expect(source).toContain('trace verdict=<b>{guardrailAuditVerdict}</b>');
  });
});
