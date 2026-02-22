export type QatFeedbackCalibrationInputRowV0 = {
  id: string;
  targetPct: number;
  wQatPct: number;
};

export type QatFeedbackCalibrationResultRowV0 = {
  id: string;
  beforeWQatPct: number;
  afterWQatPct: number;
  impactPct: number;
};

export function calibrateQatFeedbackLoopV0(
  rows: QatFeedbackCalibrationInputRowV0[],
  feedbackSignal: number,
): QatFeedbackCalibrationResultRowV0[] {
  const signal = Number.isFinite(feedbackSignal) ? Math.max(-1, Math.min(1, feedbackSignal)) : 0;
  const adjustmentStrength = 0.12 * signal;

  return rows.map((row) => {
    const targetPct = Math.max(0, Number.isFinite(row.targetPct) ? row.targetPct : 0);
    const beforeWQatPct = Math.max(0, Number.isFinite(row.wQatPct) ? row.wQatPct : 0);
    const deltaToTarget = targetPct - beforeWQatPct;
    const afterWQatPct = Math.max(0, beforeWQatPct + deltaToTarget * adjustmentStrength);

    return {
      id: row.id,
      beforeWQatPct,
      afterWQatPct,
      impactPct: afterWQatPct - beforeWQatPct,
    };
  });
}
