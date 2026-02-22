export type HumanFactorLogicConsistencyInputV0 = {
  blockerCount: number;
  warningCount: number;
  logicDivergenceCount: number;
  missingPriceCount: number;
};

export type HumanFactorLogicConsistencyResultV0 = {
  humanFactorScore: number;
  logicConsistencyScore: number;
  evidenceCoveragePct: number;
  loopStatus: 'stable loop' | 'needs intervention';
};

export function scoreHumanFactorLogicConsistencyV0(input: HumanFactorLogicConsistencyInputV0): HumanFactorLogicConsistencyResultV0 {
  const blockerCount = Number.isFinite(input.blockerCount) ? Math.max(0, input.blockerCount) : 0;
  const warningCount = Number.isFinite(input.warningCount) ? Math.max(0, input.warningCount) : 0;
  const logicDivergenceCount = Number.isFinite(input.logicDivergenceCount) ? Math.max(0, input.logicDivergenceCount) : 0;
  const missingPriceCount = Number.isFinite(input.missingPriceCount) ? Math.max(0, input.missingPriceCount) : 0;

  const humanFactorScore = Math.max(0, 100 - blockerCount * 18 - warningCount * 5);
  const logicConsistencyScore = Math.max(0, 100 - logicDivergenceCount * 7 - missingPriceCount * 10);
  const evidencePenalty = Math.min(60, blockerCount * 6 + warningCount * 2 + missingPriceCount * 4);
  const evidenceCoveragePct = Math.max(0, 100 - evidencePenalty);
  const loopStatus = humanFactorScore >= 70 && logicConsistencyScore >= 70 ? 'stable loop' : 'needs intervention';

  return { humanFactorScore, logicConsistencyScore, evidenceCoveragePct, loopStatus };
}
