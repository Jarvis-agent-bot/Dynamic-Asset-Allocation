import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-precheck-simulator-f0072-v0', () => {
  it('adds pressure-mode telemetry to guardrail precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const guardrailPrecheckPressureMode = guardrailPrecheckBlockedCount === 0");
    expect(source).toContain('simulator verdict: blocked gates=<b>{guardrailPrecheckBlockedCount}/{guardrailPrecheckSimulator.length}</b> · route=<b>{guardrailPrecheckRoute}</b> · pressure=<b>{guardrailPrecheckReviewPressurePct}%</b> · readiness=<b>{guardrailPrecheckReadinessPct}%</b> · handoff=<b>{guardrailPrecheckHandoff}</b> · critical gates=<b>{guardrailPrecheckCriticalCount}</b> · escalation lane=<b>{guardrailPrecheckEscalationLane}</b> · pressure mode=<b>{guardrailPrecheckPressureMode}</b>');
  });
});
