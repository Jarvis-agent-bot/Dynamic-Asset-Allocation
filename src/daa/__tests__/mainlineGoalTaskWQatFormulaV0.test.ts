import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-task-v0', () => {
  it('adds visible W_qat formula flow using W_base * H_multiplier * AI_bias', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Mainline W_qat formula task');
    expect(source).toContain('W_qat = W_base * H_multiplier * AI_bias with visible per-symbol trace.');
    expect(source).toContain('const hMultiplier = Math.max(0.75, 1 - Math.min(0.2, driftAbs * 1.2));');
    expect(source).toContain('const aiBias = missingSet.has(id) ? 0.85 : staleSet.has(id) ? 0.92 : 1.05;');
    expect(source).toContain('W_base={(r.targetPct * 100).toFixed(2)}% * H_multiplier={r.hMultiplier.toFixed(2)} * AI_bias={r.aiBias.toFixed(2)} => W_qat={(r.wQat * 100).toFixed(2)}% -> action=<b>{r.action}</b>');
  });
});
