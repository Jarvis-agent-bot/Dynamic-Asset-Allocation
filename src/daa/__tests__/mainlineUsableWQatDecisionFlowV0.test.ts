import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-deliver-a-usable-w-qat-decision-flow-v0', () => {
  it('adds a usable W_qat decision flow with operator-visible action routing', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Usable W_qat decision flow');
    expect(source).toContain('Actionable step-by-step flow from W_target to W_qat to routing decision.');
    expect(source).toContain("const action = wQat >= r.targetPct * 0.9 ? 'keep' : wQat >= r.targetPct * 0.75 ? 'trim' : 'defer';");
    expect(source).toContain('target={(r.targetPct * 100).toFixed(2)}% -> Q={r.quality.toFixed(2)} -> W_qat={(r.wQat * 100).toFixed(2)}% -> action=<b>{r.action}</b>');
    expect(source).toContain('Apply W_qat to target weights');
    expect(source).toContain('Open W_qat order routing');
  });
});
