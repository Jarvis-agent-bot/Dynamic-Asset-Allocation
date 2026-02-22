import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runQatDecisionMatrixEngineV0 } from '../qatDecisionMatrixEngineV0';

describe('backend-qat-decision-matrix-engine-v0', () => {
  it('links H_multiplier to rebalance threshold pressure and returns recommendation', () => {
    const result = runQatDecisionMatrixEngineV0({
      wBase: 0.2,
      driftPct: 0.03,
      thresholdPct: 0.02,
      isMissingPrice: false,
      isStalePrice: true,
    });

    expect(result.hMultiplier).toBe(0.75);
    expect(result.aiBias).toBe(0.92);
    expect(result.wQat).toBeCloseTo(0.138, 6);
    expect(result.recommendation).toBe('defer');
  });

  it('wires operator trace through the backend matrix engine and threshold display', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("import { runQatDecisionMatrixEngineV0 } from '@/src/daa/qatDecisionMatrixEngineV0';");
    expect(source).toContain('const decision = runQatDecisionMatrixEngineV0({');
    expect(source).toContain('thr={(driftThresholdPct * 100).toFixed(2)}%');
  });
});
