import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-weight-adjusted-targets-v0', () => {
  it('renders W_qat quality-adjusted targets with factor trace visible to operators', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('QAT weight-adjusted targets (W_qat)');
    expect(source).toContain('Operator-visible factor trace for quality-adjusted target weights.');
    expect(source).toContain('const quality = Math.max(0.6, 1 - Math.min(0.35, driftAbs * 1.8) - (missingSet.has(id) ? 0.2 : 0) - (staleSet.has(id) ? 0.1 : 0));');
    expect(source).toContain('W_target={(r.targetPct * 100).toFixed(2)}% × Q={r.quality.toFixed(2)}');
    expect(source).toContain('=> W_qat=<b>{(r.wQat * 100).toFixed(2)}%</b>');
  });
});
