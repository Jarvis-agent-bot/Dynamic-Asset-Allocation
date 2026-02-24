import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-maxin-maxout-guardrail-audit-view-v3', () => {
  it('adds per-row audit score and audit band traces to guardrail audit view', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const guardrailAuditScore = Math.min(100, (maxInBreachDistance + maxOutBreachDistance) * 1000);');
    expect(source).toContain("const guardrailAuditBand = guardrailAuditScore >= 20 ? 'critical' : guardrailAuditScore >= 10 ? 'elevated' : guardrailAuditScore > 0 ? 'watch' : 'clear';");
    expect(source).toContain('audit score=<b>{guardrailAuditScore.toFixed(1)}</b>');
    expect(source).toContain('audit band=<b>{guardrailAuditBand}</b>');
  });
});
