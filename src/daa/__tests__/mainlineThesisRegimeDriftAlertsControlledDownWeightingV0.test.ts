import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-thesis-regime-drift-alerts-and-controlled-down-weighting-v0', () => {
  it('adds drift alerts with controlled down-weighting actions', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Thesis-regime drift alerts + controlled down-weighting');
    expect(source).toContain('Alert drifted symbols and apply a controlled down-weight factor.');
    expect(source).toContain('const downWeightFactor = 0.85;');
    expect(source).toContain('W_base={(base * 100).toFixed(2)}% -> W_controlled={(adjusted * 100).toFixed(2)}% (factor {downWeightFactor.toFixed(2)})');
    expect(source).toContain('Apply controlled down-weighting');
    expect(source).toContain('Re-route drifted recommendations');
  });
});
