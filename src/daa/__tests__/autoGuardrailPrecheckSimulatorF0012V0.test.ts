import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-precheck-simulator-f0012-v0', () => {
  it('adds a guardrail-first precheck simulator with route verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Guardrail-first precheck simulator');
    expect(source).toContain('const guardrailPrecheckSimulator = [');
    expect(source).toContain("const guardrailPrecheckBlockedCount = guardrailPrecheckSimulator.filter((row) => row.status === 'blocked').length;");
    expect(source).toContain("const guardrailPrecheckRoute = guardrailPrecheckBlockedCount === 0");
    expect(source).toContain('simulator verdict: blocked gates=<b>{guardrailPrecheckBlockedCount}/{guardrailPrecheckSimulator.length}</b> · route=<b>{guardrailPrecheckRoute}</b>');
  });
});
