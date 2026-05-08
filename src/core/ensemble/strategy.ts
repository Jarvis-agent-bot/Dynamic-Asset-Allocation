function normalizeTargetWeights(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [symbolRaw, valueRaw] of Object.entries(input || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const value = Number(valueRaw);
    if (!symbol || !Number.isFinite(value) || value <= 0) continue;
    out[symbol] = value;
    sum += value;
  }
  if (sum <= 0) return {};
  for (const symbol of Object.keys(out)) {
    out[symbol] = out[symbol] / sum;
  }
  return out;
}

export function buildEqualWeightTargetWeights(symbols: string[]): Record<string, number> {
  const unique = [...new Set((symbols || []).map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))];
  if (!unique.length) return {};
  const w = 1 / unique.length;
  return Object.fromEntries(unique.map((symbol) => [symbol, w]));
}

export function buildMomentumTargetWeights(returnsBySymbol: Record<string, number>): Record<string, number> {
  const positive: Record<string, number> = {};
  for (const [symbolRaw, raw] of Object.entries(returnsBySymbol || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const value = Number(raw);
    if (!symbol || !Number.isFinite(value)) continue;
    if (value <= 0) continue;
    positive[symbol] = value;
  }
  return normalizeTargetWeights(positive);
}

export function buildRiskParityTargetWeights(volBySymbol: Record<string, number>): Record<string, number> {
  const inverseVol: Record<string, number> = {};
  for (const [symbolRaw, raw] of Object.entries(volBySymbol || {})) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    const vol = Number(raw);
    if (!symbol || !Number.isFinite(vol) || vol <= 0) continue;
    inverseVol[symbol] = 1 / vol;
  }
  return normalizeTargetWeights(inverseVol);
}

function projectToSimplex(values: number[]): number[] {
  if (!values.length) return [];

  const sorted = [...values].sort((left, right) => right - left);
  let runningSum = 0;
  let rho = -1;
  let theta = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    runningSum += sorted[i];
    const nextTheta = (runningSum - 1) / (i + 1);
    if (sorted[i] - nextTheta > 0) {
      rho = i;
      theta = nextTheta;
    }
  }

  if (rho < 0) {
    const fallback = 1 / values.length;
    return values.map(() => fallback);
  }

  const projected = values.map((value) => Math.max(value - theta, 0));
  const sum = projected.reduce((acc, value) => acc + value, 0);
  if (!(sum > 0)) {
    const fallback = 1 / values.length;
    return values.map(() => fallback);
  }

  return projected.map((value) => value / sum);
}

function buildSymmetricCovarianceMatrix(covMatrix: Record<string, Record<string, number>>): {
  symbols: string[];
  matrix: number[][];
} {
  const symbols = Object.keys(covMatrix || {})
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol) => {
      const variance = Number((covMatrix?.[symbol] || {})[symbol]);
      return Number.isFinite(variance) && variance > 0;
    })
    .sort();

  if (!symbols.length) {
    return { symbols: [], matrix: [] };
  }

  const variances = symbols
    .map((symbol) => Number((covMatrix?.[symbol] || {})[symbol]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgVariance = variances.length
    ? variances.reduce((sum, value) => sum + value, 0) / variances.length
    : 0;
  const ridge = Math.max(1e-12, avgVariance * 1e-8);

  const matrix = symbols.map((leftSymbol, rowIndex) => symbols.map((rightSymbol, colIndex) => {
    const leftToRight = Number((covMatrix?.[leftSymbol] || {})[rightSymbol]);
    const rightToLeft = Number((covMatrix?.[rightSymbol] || {})[leftSymbol]);

    let cell = 0;
    if (Number.isFinite(leftToRight) && Number.isFinite(rightToLeft)) {
      cell = (leftToRight + rightToLeft) / 2;
    } else if (Number.isFinite(leftToRight)) {
      cell = leftToRight;
    } else if (Number.isFinite(rightToLeft)) {
      cell = rightToLeft;
    }

    if (rowIndex === colIndex) {
      const variance = Number((covMatrix?.[leftSymbol] || {})[leftSymbol]);
      cell = Number.isFinite(variance) && variance > 0 ? variance + ridge : ridge;
    }

    return Number.isFinite(cell) ? cell : 0;
  }));

  return { symbols, matrix };
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] || 0), 0));
}

function computePortfolioVariance(matrix: number[][], weights: number[]): number {
  const sigmaW = multiplyMatrixVector(matrix, weights);
  return weights.reduce((sum, weight, index) => sum + weight * sigmaW[index], 0);
}

export function buildMinVarianceTargetWeights(covMatrix: Record<string, Record<string, number>>): Record<string, number> {
  const { symbols, matrix } = buildSymmetricCovarianceMatrix(covMatrix);

  if (symbols.length === 0) return {};
  if (symbols.length === 1) return { [symbols[0]]: 1 };

  let maxRowAbsSum = 0;
  for (const row of matrix) {
    const rowAbsSum = row.reduce((sum, value) => sum + Math.abs(value), 0);
    if (rowAbsSum > maxRowAbsSum) maxRowAbsSum = rowAbsSum;
  }

  const step = maxRowAbsSum > 0 ? 1 / (2 * maxRowAbsSum) : 1;
  let weights = symbols.map(() => 1 / symbols.length);
  let bestWeights = [...weights];
  let bestVariance = computePortfolioVariance(matrix, weights);

  for (let iter = 0; iter < 400; iter += 1) {
    const sigmaW = multiplyMatrixVector(matrix, weights);
    const gradient = sigmaW.map((value) => 2 * value);
    const candidate = projectToSimplex(weights.map((weight, index) => weight - step * gradient[index]));
    const candidateVariance = computePortfolioVariance(matrix, candidate);

    if (Number.isFinite(candidateVariance) && candidateVariance < bestVariance) {
      bestVariance = candidateVariance;
      bestWeights = [...candidate];
    }

    const diff = candidate.reduce((sum, value, index) => sum + Math.abs(value - weights[index]), 0);
    weights = candidate;
    if (diff <= 1e-10) break;
  }

  if (!Number.isFinite(bestVariance)) return {};
  return normalizeTargetWeights(Object.fromEntries(symbols.map((symbol, index) => [symbol, bestWeights[index]])));
}
