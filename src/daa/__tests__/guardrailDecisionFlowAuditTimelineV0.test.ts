import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-timeline-audit-f0007-v0', () => {
  it('adds an audit timeline for the guardrail-first decision flow', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Guardrail-first decision flow audit timeline');
    expect(source).toContain('const guardrailDecisionFlowTimeline = [');
    expect(source).toContain("T0 threshold gate=${guardrailThresholdGateBlocked ? 'blocked' : 'pass'}");
    expect(source).toContain("T1 liquidity gate=${guardrailLiquidityGateBlocked ? 'blocked' : 'pass'}");
    expect(source).toContain("timeline verdict: <b>{guardrailDecisionFlowBlocked ? 'blocked-by-guardrails' : 'clear-for-preflight'}</b>");
  });
});
