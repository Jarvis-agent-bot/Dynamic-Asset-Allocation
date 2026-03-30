/**
 * 现金管理分析 — 纯算法，无副作用
 * Cash analytics：现金成本、部署建议、流动性管理
 */

export interface CashAnalytics {
  totalCash: number;
  cashPct: number; // 现金占比 = cash / totalEquity
  cashDragPct: number; // 每年因持有现金失去的收益（%）
  targetCashPct: number; // 目标现金比例，来自配置
  excessCash: number; // 超过目标缓冲的现金量
  deployableAmount: number; // 可用于投资的过剩现金
  recommendation: "deploy" | "hold" | "withdraw";
  recommendationReason: string;
}

/**
 * 分析现金头寸并生成部署建议
 *
 * @param params - 参数对象
 * @param params.cash - 当前现金额
 * @param params.totalEquity - 总权益（现金 + 持仓市值）
 * @param params.targetCashPct - 目标现金比例，例如 0.05（5%）
 * @param params.portfolioExpectedReturn - 组合预期年化收益率，例如 0.08（8%）
 * @param params.llmAdvice - LLM 给出的建议："hold" | "deploy_to_underweight" | "await_signal" | undefined
 * @param params.marketRegime - 市场制度："risk_on" | "risk_off" | "transitional" | undefined
 *
 * @returns CashAnalytics 对象，包含分析结果和建议
 */
export function analyzeCash(params: {
  cash: number;
  totalEquity: number;
  targetCashPct: number;
  portfolioExpectedReturn: number;
  llmAdvice?: "hold" | "deploy_to_underweight" | "await_signal";
  marketRegime?: "risk_on" | "risk_off" | "transitional";
}): CashAnalytics {
  // 输入验证
  if (!Number.isFinite(params.cash) || params.cash < 0) {
    throw new Error("cash must be non-negative");
  }
  if (!Number.isFinite(params.totalEquity) || params.totalEquity <= 0) {
    throw new Error("totalEquity must be positive");
  }
  if (!Number.isFinite(params.targetCashPct) || params.targetCashPct < 0 || params.targetCashPct > 1) {
    throw new Error("targetCashPct must be in [0, 1]");
  }
  if (!Number.isFinite(params.portfolioExpectedReturn)) {
    throw new Error("portfolioExpectedReturn must be finite");
  }

  // 基本计算
  const cashPct = params.cash / params.totalEquity;
  const targetCashAmount = params.targetCashPct * params.totalEquity;
  const excessCash = Math.max(0, params.cash - targetCashAmount);

  // 现金成本（机会成本）
  // 假设现金年化收益为 0，而组合预期收益为 portfolioExpectedReturn
  // 现金拖累 = (实际现金占比 - 目标现金占比) × 组合预期收益率
  const cashDragPct = (cashPct - params.targetCashPct) * params.portfolioExpectedReturn;

  // 可部署金额 = 超额现金的 95%，预留 5% 流动性缓冲
  const deployableAmount = Math.max(0, excessCash * 0.95);

  // 生成建议
  let recommendation: "deploy" | "hold" | "withdraw";
  let recommendationReason: string;

  // 逻辑 1：市场制度检查
  if (params.marketRegime === "risk_off") {
    // 风险厌恶时期，保留现金
    if (cashPct < 0.2) {
      recommendation = "hold";
      recommendationReason = "市场风险厌恶模式，建议维持现金。";
    } else {
      recommendation = "hold";
      recommendationReason =
        "市场风险厌恶，现金充足，维持防守态势。";
    }
  } else if (params.marketRegime === "risk_on") {
    // 风险偏好时期，倾向部署
    if (excessCash > params.totalEquity * 0.05) {
      recommendation = "deploy";
      recommendationReason =
        "市场风险偏好，现金充足，建议逐步部署到权重不足的资产。";
    } else {
      recommendation = "hold";
      recommendationReason = "市场风险偏好，但现金不足，维持当前配置。";
    }
  } else {
    // 过渡态或未指定
    // 逻辑 2：LLM 建议检查
    if (params.llmAdvice === "await_signal") {
      recommendation = "hold";
      recommendationReason = "LLM 建议等待信号，暂不部署现金。";
    } else if (params.llmAdvice === "deploy_to_underweight") {
      if (excessCash > params.totalEquity * 0.03) {
        recommendation = "deploy";
        recommendationReason =
          "LLM 建议部署到权重不足的资产，现金可用。";
      } else {
        recommendation = "hold";
        recommendationReason =
          "LLM 建议部署，但现金不足，建议先观察。";
      }
    } else {
      // 默认逻辑：超额现金部署阈值
      if (excessCash > params.totalEquity * 0.05) {
        recommendation = "deploy";
        recommendationReason =
          `超额现金 ${(excessCash / params.totalEquity * 100).toFixed(1)}%，建议逐步部署。`;
      } else if (excessCash > params.totalEquity * 0.03) {
        recommendation = "deploy";
        recommendationReason =
          `超额现金 ${(excessCash / params.totalEquity * 100).toFixed(1)}%，可小额部署。`;
      } else {
        recommendation = "hold";
        recommendationReason =
          `现金占比 ${(cashPct * 100).toFixed(1)}%，接近目标，维持当前。`;
      }
    }
  }

  return {
    totalCash: params.cash,
    cashPct,
    cashDragPct,
    targetCashPct: params.targetCashPct,
    excessCash,
    deployableAmount,
    recommendation,
    recommendationReason,
  };
}

/**
 * 助手函数：根据市场制度估算组合预期收益率
 * 用于 LLM 或其他上层逻辑缺少预期收益率时的默认值
 *
 * @param marketRegime 市场制度
 * @returns 预期年化收益率（作为小数，例如 0.08 = 8%）
 */
export function estimateExpectedReturnByRegime(
  marketRegime?: string,
): number {
  if (marketRegime === "risk_on") {
    return 0.10; // 10% 风险偏好时期
  }
  if (marketRegime === "risk_off") {
    return 0.03; // 3% 风险厌恶时期
  }
  if (marketRegime === "transitional") {
    return 0.05; // 5% 过渡态
  }
  return 0.08; // 8% 默认（平常情况）
}

/**
 * 助手函数：计算现金部署分阶段计划
 * 用于将可部署现金分批投入，降低市场时机风险
 *
 * @param deployableAmount 可部署金额
 * @param stages 分阶段数，默认 3
 * @returns 每个阶段的部署金额数组
 */
export function generateCashDeploymentSchedule(
  deployableAmount: number,
  stages: number = 3,
): number[] {
  if (stages <= 0) return [];
  if (deployableAmount <= 0) return new Array(stages).fill(0);

  // 简单均分策略
  const perStage = deployableAmount / stages;
  return new Array(stages).fill(perStage);
}

/**
 * 高级现金分析：融合多个维度
 * 返回更详细的现金管理决策支持信息
 */
export function analyzeCashAdvanced(params: {
  cash: number;
  totalEquity: number;
  targetCashPct: number;
  portfolioExpectedReturn: number;
  llmAdvice?: "hold" | "deploy_to_underweight" | "await_signal";
  marketRegime?: "risk_on" | "risk_off" | "transitional";
  // 额外维度
  volatilityIndex?: number; // VIX 或类似指标（高 = 市场风险大）
  liquidityScore?: number; // 0-100，组合流动性评分
  marginUtilization?: number; // 0-1，融资利用率
}): CashAnalytics & {
  volatilityAdjustment: number;
  liquidityBuffer: number;
  marginSafetyRatio: number;
} {
  const base = analyzeCash(params);

  // 根据波动性调整现金缓冲
  let volatilityAdjustment = 0;
  if (params.volatilityIndex !== undefined) {
    // VIX > 25 时建议增加现金缓冲
    if (params.volatilityIndex > 25) {
      volatilityAdjustment = 0.02; // 额外 2% 的现金缓冲
    } else if (params.volatilityIndex > 20) {
      volatilityAdjustment = 0.01; // 额外 1% 的现金缓冲
    }
  }

  // 流动性缓冲
  let liquidityBuffer = 0;
  if (params.liquidityScore !== undefined) {
    // 流动性评分低时需要更多现金缓冲
    liquidityBuffer = Math.max(0, (50 - params.liquidityScore) / 1000);
  }

  // 融资安全比率
  let marginSafetyRatio = 1.0;
  if (params.marginUtilization !== undefined) {
    // 融资越多，需要越多现金缓冲
    marginSafetyRatio = 1 + params.marginUtilization;
  }

  return {
    ...base,
    volatilityAdjustment,
    liquidityBuffer,
    marginSafetyRatio,
  };
}
