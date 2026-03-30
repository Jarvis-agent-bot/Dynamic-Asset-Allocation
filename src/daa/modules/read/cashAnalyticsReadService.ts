/**
 * 现金管理分析读取服务
 * 从数据库聚合数据并调用核心算法进行现金分析
 */

import { toFinite as toFiniteNumber, toPositive } from "@/src/daa/utils/normalize";
import {
  getDaaAccountState,
  listDaaEquitySnapshots,
  getDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";
import {
  analyzeCash,
  estimateExpectedReturnByRegime,
  analyzeCashAdvanced,
  type CashAnalytics,
} from "@/src/core/cashManagement";
import { getCurrentMarketContext } from "@/src/daa/modules/marketContext/marketIndicatorService";
import type { DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";

export type CashAnalyticsReadModel = {
  basic: CashAnalytics;
  advanced: CashAnalytics & {
    volatilityAdjustment: number;
    liquidityBuffer: number;
    marginSafetyRatio: number;
  };
  marketRegime: DaaMarketRegime | null;
  portfolioExpectedReturn: number;
  baseCurrency: string;
  loadedAt: string;
};

/**
 * 从市场指标推断 LLM 建议
 * 这里仅为演示；实际应该由 LLM 模块返回
 */
function inferLlmAdvice(marketRegime: DaaMarketRegime | null): "hold" | "deploy_to_underweight" | "await_signal" | undefined {
  if (!marketRegime) return undefined;

  if (marketRegime === "risk_off") {
    return "await_signal";
  }
  if (marketRegime === "risk_on") {
    return "deploy_to_underweight";
  }
  return undefined;
}

/**
 * 构建现金分析读取模型
 */
export async function buildCashAnalyticsReadModel(): Promise<CashAnalyticsReadModel> {
  // 并行加载数据
  const [accountState, snapshots, system, marketContext] = await Promise.all([
    getDaaAccountState(),
    listDaaEquitySnapshots(100),
    getDaaSystemConfig(),
    getCurrentMarketContext(),
  ]);

  const baseCurrency = system.config.strategy.account.baseCurrency || "USD";
  // 目标现金比例：从配置中的 operationalReservePct（如果有），否则默认 5%
  const targetCashPct = toPositive(
    system.config.rebalanceStrategy?.cash?.operationalReservePct || 0.05,
    0.05,
  );
  const cash = toPositive(accountState.cash, 0);
  const frozenCash = toPositive(accountState.frozenCash, 0);

  // 计算总权益：如果配置中有，则使用；否则从权益快照获取
  let totalEquity = accountState.totalEquity ? toPositive(accountState.totalEquity, 0) : 0;
  if (totalEquity <= 0 && snapshots.length > 0) {
    // 使用最新的权益快照
    totalEquity = toPositive(snapshots[0]?.totalEquity, 0);
  }

  if (totalEquity <= 0) {
    // 无法计算，返回默认值
    return {
      basic: {
        totalCash: cash,
        cashPct: 0,
        cashDragPct: 0,
        targetCashPct,
        excessCash: 0,
        deployableAmount: 0,
        recommendation: "hold",
        recommendationReason: "权益数据不可用，无法进行现金分析。",
      },
      advanced: {
        totalCash: cash,
        cashPct: 0,
        cashDragPct: 0,
        targetCashPct,
        excessCash: 0,
        deployableAmount: 0,
        recommendation: "hold",
        recommendationReason: "权益数据不可用，无法进行现金分析。",
        volatilityAdjustment: 0,
        liquidityBuffer: 0,
        marginSafetyRatio: 1,
      },
      marketRegime: marketContext?.regime || null,
      portfolioExpectedReturn: 0.08,
      baseCurrency,
      loadedAt: new Date().toISOString(),
    };
  }

  const marketRegime = marketContext?.regime as DaaMarketRegime | null;
  const portfolioExpectedReturn = estimateExpectedReturnByRegime(marketRegime as any);
  const llmAdvice = inferLlmAdvice(marketRegime);

  // 获取 VIX（如果可用）
  const vixIndicator = marketContext?.indicators?.find((ind) => ind.key === "vix");
  const vixValue = vixIndicator?.rawValue || undefined;

  // 计算基础现金分析
  const basic = analyzeCash({
    cash,
    totalEquity,
    targetCashPct,
    portfolioExpectedReturn,
    llmAdvice,
    marketRegime: marketRegime as any,
  });

  // 计算高级分析
  const advanced = analyzeCashAdvanced({
    cash,
    totalEquity,
    targetCashPct,
    portfolioExpectedReturn,
    llmAdvice,
    marketRegime: marketRegime as any,
    volatilityIndex: vixValue,
    liquidityScore: 75, // 默认评分，实际应由流动性模块计算
    marginUtilization: 0, // 模拟账户无融资
  });

  return {
    basic,
    advanced,
    marketRegime,
    portfolioExpectedReturn,
    baseCurrency,
    loadedAt: new Date().toISOString(),
  };
}

/**
 * 快速摘要：用于 UI 仪表盘显示
 */
export async function buildCashAnalyticsSummary() {
  const model = await buildCashAnalyticsReadModel();

  return {
    totalCash: model.basic.totalCash,
    cashPct: model.basic.cashPct,
    targetCashPct: model.basic.targetCashPct,
    excessCash: model.basic.excessCash,
    deployableAmount: model.basic.deployableAmount,
    cashDragPct: model.basic.cashDragPct,
    recommendation: model.basic.recommendation,
    baseCurrency: model.baseCurrency,
  };
}
