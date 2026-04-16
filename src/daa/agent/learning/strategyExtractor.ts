/**
 * Strategy Extractor — 从高准确率 run 中提炼调查策略
 *
 * 借鉴 Hermes 的 Skill 自生成：
 * - 不是生成代码，而是生成"调查策略模板"
 * - 例如："当 VIX > 25 时，优先调查防御性资产的估值信号"
 *
 * 由 learnNode 在每个 cycle 的 review 阶段后调用。
 */

import type { StrategyExtractionInput } from "@/src/daa/agent/learning/types";
import { createStrategy, listStrategies } from "@/src/daa/agent/learning/strategyStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/**
 * 尝试从一个成功的 Agent run 中提炼调查策略。
 *
 * 条件：
 * - run 必须有 thesesUpdated > 0（确实产生了有效调查）
 * - 工具组合至少 2 个不同工具（单工具无法提炼组合模式）
 *
 * 策略提取不调 LLM（Phase 2 阶段用规则提炼，Phase 3 可升级为 LLM 提炼）。
 */
export async function extractStrategyFromRun(
  input: StrategyExtractionInput,
): Promise<{ created: boolean; strategyName?: string }> {
  try {
    // 前置条件检查
    if (input.thesesUpdated <= 0) {
      return { created: false };
    }

    const uniqueTools = [...new Set(input.toolsCalled.map(t => t.tool))];
    if (uniqueTools.length < 2) {
      return { created: false };
    }

    // 检查是否已有类似策略（避免重复）
    const existing = await listStrategies(50);
    const toolKey = uniqueTools.sort().join(",");
    const duplicate = existing.find(s => s.toolSequence.sort().join(",") === toolKey);
    if (duplicate) {
      return { created: false };
    }

    // 提炼触发条件
    const conditions: string[] = [];
    if (input.regime) conditions.push(`regime=${input.regime}`);
    if (input.targetConvictions.length > 0) {
      const primaryConviction = input.targetConvictions[0];
      conditions.push(`conviction=${primaryConviction}`);
    }
    const triggerConditions = conditions.join(" AND ") || "any";

    // 提炼策略名称
    const toolLabels: Record<string, string> = {
      fetch_technical_signal: "技术",
      fetch_valuation_signal: "估值",
      fetch_news_signal: "新闻",
      fetch_human_signal: "机构",
      query_market_regime: "宏观",
      query_portfolio_concentration: "集中度",
      backtest_thesis: "回测",
      compute_correlation: "相关性",
      simulate_rebalance: "模拟调仓",
      evaluate_self_accuracy: "准确率",
      query_thesis_history: "论点历史",
      query_past_decisions: "决策回顾",
    };
    const toolNames = uniqueTools.map(t => toolLabels[t] ?? t).join("+");
    const name = `${input.regime ?? "通用"}_${toolNames}`;

    // 生成 prompt template
    const promptTemplate = `基于历史经验，在 ${triggerConditions} 条件下，推荐先使用 ${uniqueTools.slice(0, 3).join("→")} 的调查顺序。此组合在过去的调查中有效产出了论点更新。`;

    const strategy = await createStrategy({
      name,
      description: `从 run ${input.runId} 提炼：${triggerConditions} 条件下的 ${uniqueTools.length} 工具组合策略`,
      triggerConditions,
      toolSequence: uniqueTools,
      promptTemplate,
      sourceRunIds: [input.runId],
      successRate: input.thesesUpdated > 0 ? 0.8 : 0.5, // 初始乐观估计
    });

    if (strategy) {
      return { created: true, strategyName: strategy.name };
    }
    return { created: false };
  } catch (e) {
    logSwallowed("strategyExtractor.extract", e);
    return { created: false };
  }
}
