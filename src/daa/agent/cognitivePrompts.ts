/**
 * Cognitive Agent — DeepSeek Prompt 模板
 *
 * 每个 LangGraph 节点对应一个专门的 prompt。
 * 所有 prompt 要求 DeepSeek 输出结构化 JSON。
 */

import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import type { ResearchThread, AgentMemory } from "@/src/daa/agent/cognitiveTypes";
import type { MarketSnapshot, PortfolioSnapshot, NewsSnapshot } from "@/src/daa/agent/cognitiveState";

// ── Prioritize 节点 Prompt ──

export function buildPrioritizePrompt(ctx: {
  portfolio: PortfolioSnapshot;
  market: MarketSnapshot;
  news: NewsSnapshot;
  theses: ResearchThread[];
}): string {
  const holdingSummary = ctx.portfolio.holdings
    .slice(0, 30)
    .map(h => `${h.assetKey} 权重${(h.weightPct * 100).toFixed(1)}% PnL${h.unrealizedPnlPct != null ? (h.unrealizedPnlPct * 100).toFixed(1) + "%" : "N/A"}`)
    .join("\n");

  const thesisSummary = ctx.theses
    .slice(0, 15)
    .map(t => `[${t.id.slice(0, 8)}] "${sanitizeForPrompt(t.title, 60)}" conviction=${t.conviction} 资产=${t.assetKeys.join(",")}`)
    .join("\n");

  const newsSummary = ctx.news.items
    .slice(0, 10)
    .map(n => `${n.symbol}: ${sanitizeForPrompt(n.title, 80)}`)
    .join("\n");

  return `你是一个投资研究操作系统的「投委会主席」。你的职责是决定今天最值得深入调查的研究线索。

## 当前组合
总权益: $${ctx.portfolio.totalEquity.toFixed(0)}
现金占比: ${(ctx.portfolio.cashPct * 100).toFixed(1)}%
${holdingSummary}

## 市场环境
Regime: ${ctx.market?.regime ?? "unknown"}
VIX: ${ctx.market?.vix ?? "N/A"}

## 最近新闻
${newsSummary || "无最新新闻"}

## 活跃研究论点
${thesisSummary || "暂无活跃论点（首次运行）"}

## 任务
1. 从活跃论点中选出最需要立即调查的 1-3 个。优先级依据：
   - 相关资产权重高但 thesis 久未更新
   - 新闻与现有 thesis 矛盾
   - conviction 为 "uncertain" 需要明确
2. 如果发现任何不在现有论点中的重大变化，建议创建新研究线索。

## 输出格式（严格 JSON）
\`\`\`json
{
  "targets": [
    {
      "threadId": "论点ID或null（null表示新建）",
      "reason": "为什么需要调查",
      "dataNeeded": ["technical", "valuation", "news"]
    }
  ],
  "newThreads": [
    {
      "title": "新研究线索标题",
      "initialThesis": "初始判断",
      "assetKeys": ["US:AAPL"],
      "tags": ["个股"]
    }
  ]
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// ── Investigate 节点 Prompt ──

export function buildInvestigatePrompt(ctx: {
  thread: ResearchThread;
  evidence: Record<string, unknown>;
  memories: AgentMemory[];
  portfolio: PortfolioSnapshot;
}): string {
  const memoryText = ctx.memories.length > 0
    ? ctx.memories.map(m => `- [${m.memoryType}] ${sanitizeForPrompt(m.content, 100)}`).join("\n")
    : "无相关历史记忆";

  const evidenceText = Object.entries(ctx.evidence)
    .map(([tool, data]) => {
      const summary = typeof data === "object" && data !== null
        ? JSON.stringify(data, null, 0).slice(0, 500)
        : String(data).slice(0, 500);
      return `### ${tool}\n${summary}`;
    })
    .join("\n\n");

  return `你是一个投资研究操作系统的「研究分析师」。你正在深入调查一个研究线索。

## 当前论点
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
信念强度: ${ctx.thread.conviction}
失效条件: ${ctx.thread.invalidationConditions ? sanitizeForPrompt(ctx.thread.invalidationConditions, 150) : "未定义"}
关联资产: ${ctx.thread.assetKeys.join(", ")}

## 新收集的证据
${evidenceText}

## 历史记忆
${memoryText}

## 组合背景
相关资产在组合中的权重:
${ctx.portfolio.holdings
  .filter(h => ctx.thread.assetKeys.includes(h.assetKey))
  .map(h => `${h.assetKey}: ${(h.weightPct * 100).toFixed(1)}% PnL=${h.unrealizedPnlPct != null ? (h.unrealizedPnlPct * 100).toFixed(1) + "%" : "N/A"}`)
  .join("\n") || "无相关持仓"}

## 任务
基于新证据，重新评估这个论点。回答：
1. 论点是否需要更新？
2. 新证据是支持、反驳还是中立？
3. 什么最让你意外？
4. 什么条件会推翻当前判断？
5. 建议多少天后复盘？

## 输出格式（严格 JSON）
\`\`\`json
{
  "thesisChanged": true,
  "updatedThesis": "更新后的判断（如果没变则为null）",
  "newConviction": "high/medium/low/uncertain 或 null",
  "evidenceType": "supporting/contradicting/neutral",
  "evidenceSummary": "本次调查发现的关键证据摘要",
  "surprises": [
    {
      "title": "意外发现标题",
      "description": "详细描述",
      "relatedThesisId": "关联的论点ID或null",
      "severityScore": 7,
      "suggestedAction": "建议采取的行动"
    }
  ],
  "invalidationConditions": "更新后的失效条件",
  "suggestedReviewDays": 14,
  "nextActions": ["下一步应调查的方向"]
}
\`\`\`

只输出 JSON，不要其他文字。`;
}
