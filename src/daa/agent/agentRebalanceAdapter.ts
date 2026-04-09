/**
 * Agent Rebalance Adapter — 用 Cognitive Agent 的 thesis 数据驱动调仓决策
 *
 * 替代旧 pipeline 的 Steps B.5-E（planner → signal fusion → LLM decision → guardrails）。
 * 保留 Step A（纯数学漂移计算）和 Step F-G（风控 + 持久化）。
 *
 * 逻辑：
 * 1. 从 daa_research_threads 读取每个漂移资产的 thesis + conviction
 * 2. thesis conviction → 调整提案量：high=100%, medium=60%, low=20%, uncertain=skip
 * 3. 填充 decisionContext，让前端保持兼容
 */

import type { RebalanceProposal, ProposalDecisionContext } from "@/src/daa/modules/workbench/workbenchTypes";
import { getActiveTheses, getThesisWithEvidence } from "@/src/daa/agent/store/thesisStore";
import { recallMemory } from "@/src/daa/agent/store/memoryStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";

// conviction → 提案量乘数
const CONVICTION_MULTIPLIER: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.2,
  uncertain: 0, // 跳过
};

export interface AgentRebalanceResult {
  proposals: RebalanceProposal[];
  llmSummary: string | null;
  marketRegime: DaaMarketRegime | null;
  agentStatus: "ok" | "fallback" | "error";
  tokensUsed: number;
}

/**
 * 用 Agent thesis 增强漂移提案。
 *
 * @param draftProposals Step A 的纯数学漂移提案
 * @param marketRegime 当前市场 regime
 * @param totalEquity 组合总权益
 * @param maxPositionPct 最大单仓位占比
 */
export async function enhanceProposalsWithAgent(input: {
  draftProposals: RebalanceProposal[];
  marketRegime: DaaMarketRegime | null;
  totalEquity: number;
  maxPositionPct: number;
}): Promise<AgentRebalanceResult> {
  const { draftProposals, marketRegime, totalEquity, maxPositionPct } = input;

  try {
    const theses = await getActiveTheses();
    if (theses.length === 0) {
      return {
        proposals: draftProposals,
        llmSummary: "Agent 无活跃论点，使用纯漂移计算。",
        marketRegime,
        agentStatus: "fallback",
        tokensUsed: 0,
      };
    }

    // 为每个资产匹配 thesis
    const thesisByAssetKey = new Map<string, typeof theses[0]>();
    for (const t of theses) {
      for (const ak of t.assetKeys) {
        thesisByAssetKey.set(ak, t);
      }
    }

    // 增强提案
    const enhancedProposals: RebalanceProposal[] = [];
    const skippedByAgent: string[] = [];

    for (const proposal of draftProposals) {
      const thesis = thesisByAssetKey.get(proposal.assetKey);
      const conviction = thesis?.conviction ?? "medium";
      const multiplier = CONVICTION_MULTIPLIER[conviction] ?? 0.6;

      if (multiplier === 0) {
        // uncertain → 跳过此提案
        skippedByAgent.push(proposal.symbol);
        continue;
      }

      // 调整提案量
      const adjustedQty = Math.round(proposal.suggestedQty * multiplier);
      const adjustedNotional = proposal.suggestedNotional * multiplier;

      if (adjustedQty <= 0 || adjustedNotional < 10) {
        skippedByAgent.push(proposal.symbol);
        continue;
      }

      // 填充 decisionContext（保持前端兼容）
      const decisionContext: ProposalDecisionContext = {
        driftReason: proposal.reason,
        signalAction: thesis ? (conviction === "high" ? "open_or_add" : conviction === "medium" ? "watch" : "reduce_or_avoid") : null,
        signalScore: thesis ? (conviction === "high" ? 80 : conviction === "medium" ? 60 : 30) : null,
        signalConfidence: thesis ? (conviction === "high" ? 85 : conviction === "medium" ? 60 : 35) : null,
        signalConflict: false,
        llmAdjustment: multiplier >= 0.8 ? "execute" : multiplier >= 0.4 ? "reduce_size" : "skip",
        llmConfidence: thesis ? (conviction === "high" ? 85 : 55) : null,
        llmRationale: thesis
          ? `[Agent] ${sanitizeForPrompt(thesis.thesisText, 120)} (conviction: ${thesis.conviction})`
          : null,
        finalQtyMultiplier: multiplier,
        conflictFlags: [],
        marketRegime: marketRegime ?? null,
      };

      enhancedProposals.push({
        ...proposal,
        suggestedQty: adjustedQty,
        suggestedNotional: adjustedNotional,
        reason: thesis
          ? `${proposal.reason} | Agent: ${sanitizeForPrompt(thesis.title, 40)} (${thesis.conviction})`
          : proposal.reason,
        decisionContext,
      });
    }

    // 用 LLM 生成摘要（可选，失败不阻塞）
    let llmSummary: string | null = null;
    let tokensUsed = 0;
    try {
      const config = await resolveLlmConfig();
      if (config && enhancedProposals.length > 0) {
        const prompt = `你是投资研究操作系统的调仓顾问。基于以下信息，用2-3句话总结本次调仓建议的核心逻辑。

提案: ${enhancedProposals.slice(0, 10).map(p => `${p.side} ${p.symbol} $${p.suggestedNotional.toFixed(0)}`).join(", ")}
被跳过: ${skippedByAgent.join(", ") || "无"}
市场: ${marketRegime ?? "unknown"}
活跃论点: ${theses.length}

只输出摘要文字，不要 JSON。`;
        const { text } = await callLlm(config, prompt);
        llmSummary = text.slice(0, 300);
        tokensUsed = Math.ceil(prompt.length * 0.5);
      }
    } catch (e) {
      logSwallowed("agentRebalanceAdapter.summary", e);
    }

    return {
      proposals: enhancedProposals,
      llmSummary: llmSummary || `Agent 分析: ${enhancedProposals.length} 个提案, ${skippedByAgent.length} 个跳过 (conviction 不足)`,
      marketRegime,
      agentStatus: "ok",
      tokensUsed,
    };
  } catch (e) {
    logSwallowed("agentRebalanceAdapter", e);
    return {
      proposals: draftProposals,
      llmSummary: `Agent 异常，使用纯漂移计算: ${e instanceof Error ? e.message : String(e)}`,
      marketRegime,
      agentStatus: "error",
      tokensUsed: 0,
    };
  }
}
