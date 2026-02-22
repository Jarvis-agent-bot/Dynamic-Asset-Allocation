import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreHumanFactorLogicConsistencyV0 } from '../humanFactorLogicConsistencyScoringV0';

describe('backend-humanfactor-logic-consistency-scoring-v0', () => {
  it('scores the closed loop and returns evidence coverage', () => {
    const result = scoreHumanFactorLogicConsistencyV0({ blockerCount: 1, warningCount: 2, logicDivergenceCount: 3, missingPriceCount: 1 });

    expect(result.humanFactorScore).toBe(72);
    expect(result.logicConsistencyScore).toBe(69);
    expect(result.evidenceCoveragePct).toBe(86);
    expect(result.loopStatus).toBe('needs intervention');
  });

  it('shows evidence coverage in the operator-facing loop card', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("import { scoreHumanFactorLogicConsistencyV0 } from '@/src/daa/humanFactorLogicConsistencyScoringV0';");
    expect(source).toContain('evidence-coverage=<b>{evidenceCoveragePct}%</b>');
  });
});
