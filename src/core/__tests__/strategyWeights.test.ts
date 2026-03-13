import { describe, expect, it } from "vitest";

import { buildMinVarianceTargetWeightsV1 } from "../ensemble/strategy";

function computePortfolioVarianceV1(
  covMatrix: Record<string, Record<string, number>>,
  weights: Record<string, number>,
): number {
  const symbols = Object.keys(weights).sort();
  let variance = 0;

  for (const left of symbols) {
    for (const right of symbols) {
      variance += (weights[left] || 0) * (weights[right] || 0) * (Number(covMatrix[left]?.[right]) || 0);
    }
  }

  return variance;
}

describe("buildMinVarianceTargetWeightsV1", () => {
  it("在纯对角协方差下退化为逆方差权重", () => {
    const weights = buildMinVarianceTargetWeightsV1({
      AAA: { AAA: 1, BBB: 0, CCC: 0 },
      BBB: { AAA: 0, BBB: 2, CCC: 0 },
      CCC: { AAA: 0, BBB: 0, CCC: 4 },
    });

    expect(weights.AAA).toBeCloseTo(1 / 1.75, 6);
    expect(weights.BBB).toBeCloseTo(0.5 / 1.75, 6);
    expect(weights.CCC).toBeCloseTo(0.25 / 1.75, 6);
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
  });

  it("会利用协方差而不是只看对角线方差", () => {
    const covMatrix = {
      AAA: { AAA: 1, BBB: 0.9, CCC: 0 },
      BBB: { AAA: 0.9, BBB: 1, CCC: 0 },
      CCC: { AAA: 0, BBB: 0, CCC: 2 },
    };

    const minVariance = buildMinVarianceTargetWeightsV1(covMatrix);
    const inverseVariance = {
      AAA: 0.4,
      BBB: 0.4,
      CCC: 0.2,
    };

    expect(minVariance.AAA).toBeGreaterThan(0);
    expect(minVariance.BBB).toBeGreaterThan(0);
    expect(minVariance.CCC).toBeGreaterThan(inverseVariance.CCC);
    expect(Object.values(minVariance).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);

    const minVarianceRisk = computePortfolioVarianceV1(covMatrix, minVariance);
    const inverseVarianceRisk = computePortfolioVarianceV1(covMatrix, inverseVariance);

    expect(minVarianceRisk).toBeLessThan(inverseVarianceRisk);
  });


  it("在没有有效正定对角信息时返回空结果", () => {
    const weights = buildMinVarianceTargetWeightsV1({
      AAA: { AAA: 0, BBB: 1 },
      BBB: { AAA: 1, BBB: 0 },
    });

    expect(weights).toEqual({});
  });
});
