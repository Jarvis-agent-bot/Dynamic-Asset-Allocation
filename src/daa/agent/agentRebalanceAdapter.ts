/**
 * Agent Rebalance Adapter — 用 Cognitive Agent 的 thesis 数据驱动调仓决策
 *
 * 基于 thesis conviction 调整漂移提案量，保留纯数学漂移计算和风控持久化。
 *
 * 逻辑：
 * 1. 从 daa_research_threads 读取每个漂移资产的 thesis + conviction
 * 2. thesis conviction → 调整提案量：high=100%, medium=60%, low=20%, uncertain=skip
 * 3. 填充 decisionContext，供前端展示和审计追踪
 */

import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import type { RebalanceProposal, ProposalDecisionContext } from "@/src/daa/modules/workbench/workbenchTypes";
import { getActiveTheses, getThesisAccuracyAvg } from "@/src/daa/agent/store/thesisStore";
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

const CONVICTION_RANK: Record<string, number> = {
  high: 4,
  medium: 3,
  low: 2,
  uncertain: 1,
};

function thesisUpdatedMs(thesis: Pick<ResearchThread, "updatedAt">): number {
  const ms = Date.parse(thesis.updatedAt || "");
  return Number.isFinite(ms) ? ms : 0;
}

export function selectPrimaryRebalanceThesis(theses: ResearchThread[]): ResearchThread | null {
  if (theses.length === 0) return null;
  return [...theses].sort((a, b) => {
    const rankDelta = (CONVICTION_RANK[b.conviction] ?? 0) - (CONVICTION_RANK[a.conviction] ?? 0);
    if (rankDelta !== 0) return rankDelta;
    const priorityDelta = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return thesisUpdatedMs(b) - thesisUpdatedMs(a);
  })[0] ?? null;
}

function scaleProposalForConviction(proposal: RebalanceProposal, multiplier: number): {
  adjustedQty: number;
  adjustedNotional: number;
} {
  const adjustedQty = Math.round(proposal.suggestedQty * multiplier);
  const perUnitNotional = proposal.suggestedQty > 0
    ? proposal.suggestedNotional / proposal.suggestedQty
    : 0;
  const adjustedNotional = adjustedQty > 0
    ? perUnitNotional * adjustedQty
    : 0;
  return { adjustedQty, adjustedNotional };
}

interface AgentRebalanceResult {
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
 */
export async function enhanceProposalsWithAgent(input: {
  draftProposals: RebalanceProposal[];
  marketRegime: DaaMarketRegime | null;
  totalEquity: number;
  maxPositionPct: number;
}): Promise<AgentRebalanceResult> {
  const { draftProposals, marketRegime } = input;

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

    // 为每个资产匹配 thesis（支持多 thesis 关联同一资产）
    const thesesByAssetKey = new Map<string, typeof theses>();
    for (const t of theses) {
      for (const ak of t.assetKeys) {
        const existing = thesesByAssetKey.get(ak) ?? [];
        existing.push(t);
        thesesByAssetKey.set(ak, existing);
      }
    }

    // 预加载 thesis 历史准确率（用于动态调整 multiplier）
    const accuracyCache = new Map<string, number>();
    for (const t of theses) {
      try {
        const avg = await getThesisAccuracyAvg(t.id);
        if (avg !== null) accuracyCache.set(t.id, avg);
      } catch (e) {
        logSwallowed("agentRebalanceAdapter.accuracy", e);
      }
    }

    // 增强提案
    const enhancedProposals: RebalanceProposal[] = [];
    const skippedByAgent: string[] = [];

    for (const proposal of draftProposals) {
      const relatedTheses = thesesByAssetKey.get(proposal.assetKey) ?? [];
      const thesis = selectPrimaryRebalanceThesis(relatedTheses);
      const thesisIds = relatedTheses.map((t) => t.id);
      const conviction = thesis?.conviction ?? "medium";
      let multiplier = CONVICTION_MULTIPLIER[conviction] ?? 0.6;
      const hasUncertainConflict = relatedTheses.some((t) => t.id !== thesis?.id && t.conviction === "uncertain");

      // 动态调整：基于历史准确率微调 multiplier
      if (thesis && accuracyCache.has(thesis.id)) {
        const accuracy = accuracyCache.get(thesis.id)!;
        if (accuracy > 0.7) multiplier = Math.min(multiplier * 1.1, 1.0);
        else if (accuracy < 0.3) multiplier *= 0.7;
      }

      if (multiplier === 0) {
        // uncertain → 跳过此提案
        skippedByAgent.push(proposal.symbol);
        continue;
      }

      // 调整提案量
      const { adjustedQty, adjustedNotional } = scaleProposalForConviction(proposal, multiplier);

      if (adjustedQty <= 0 || adjustedNotional < 10) {
        skippedByAgent.push(proposal.symbol);
        continue;
      }

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
        conflictFlags: hasUncertainConflict ? ["存在同资产未定论点，已用更高 conviction 论点驱动仓位"] : [],
        effectiveMarketRegime: marketRegime ?? null,
      };

      enhancedProposals.push({
        ...proposal,
        suggestedQty: adjustedQty,
        suggestedNotional: adjustedNotional,
        reason: thesis
          ? `${proposal.reason} | Agent: ${sanitizeForPrompt(thesis.title, 40)} (${thesis.conviction})`
          : proposal.reason,
        decisionContext,
        thesisIds: thesisIds.length > 0 ? thesisIds : undefined,
      });
    }

    // 用 LLM 生成摘要（可选，失败不阻塞）
    let llmSummary: string | null = null;
    let tokensUsed = 0;
    try {
      const config = await resolveLlmConfig("decision");
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
