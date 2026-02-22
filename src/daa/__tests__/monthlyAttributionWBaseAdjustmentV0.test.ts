import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-monthly-attribution-self-evolution-v0', () => {
  it('adds attribution-driven W_base adjustment suggestion in monthly report', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const wBaseAdjustmentPct = Math.max(-8, Math.min(8, ((avoidedLoss - rebalanceAlpha) / Math.max(1, total)) * 100));');
    expect(source).toContain("const wBaseAdjustmentDirection = wBaseAdjustmentPct >= 0 ? 'increase' : 'decrease';");
    expect(source).toContain('W_base adjustment suggestion: {wBaseAdjustmentDirection} by {Math.abs(wBaseAdjustmentPct).toFixed(2)}% next month (attribution-driven).');
  });
});
