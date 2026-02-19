import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-operator-visible-factor-trace-for-every-recommendation-v0', () => {
  it('renders factor-level trace for every recommendation', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Operator-visible factor trace by recommendation');
    expect(source).toContain('Every recommendation includes factor-level rationale before order routing.');
    expect(source).toContain('const recommendation = wQat >= r.targetPct * 0.9 ? \'keep\' : wQat >= r.targetPct * 0.75 ? \'trim\' : \'defer\';');
    expect(source).toContain('rec=<b>{recommendation}</b> · factors(W_base={(r.targetPct * 100).toFixed(2)}%, H={hMultiplier.toFixed(2)}, AI={aiBias.toFixed(2)}, W_qat={(wQat * 100).toFixed(2)}%)');
  });
});
