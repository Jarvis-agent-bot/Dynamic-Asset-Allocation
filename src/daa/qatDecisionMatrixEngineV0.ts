export type QatDecisionMatrixInputV0 = {
  wBase: number;
  driftPct: number;
  thresholdPct: number;
  isMissingPrice: boolean;
  isStalePrice: boolean;
};

export type QatDecisionMatrixResultV0 = {
  hMultiplier: number;
  aiBias: number;
  wQat: number;
  recommendation: 'keep' | 'trim' | 'defer';
};

export function runQatDecisionMatrixEngineV0(input: QatDecisionMatrixInputV0): QatDecisionMatrixResultV0 {
  const wBase = Number.isFinite(input.wBase) ? Math.max(0, input.wBase) : 0;
  const driftAbs = Math.abs(Number.isFinite(input.driftPct) ? input.driftPct : 0);
  const thresholdPct = Number.isFinite(input.thresholdPct) ? Math.max(0, input.thresholdPct) : 0;

  const driftPressure = thresholdPct > 0 ? Math.min(1, driftAbs / thresholdPct) : 0;
  const hMultiplier = Math.max(0.7, 1 - driftPressure * 0.25);
  const aiBias = input.isMissingPrice ? 0.85 : input.isStalePrice ? 0.92 : 1.05;
  const wQat = Math.max(0, wBase * hMultiplier * aiBias);
  const recommendation = wQat >= wBase * 0.9 ? 'keep' : wQat >= wBase * 0.75 ? 'trim' : 'defer';

  return { hMultiplier, aiBias, wQat, recommendation };
}
