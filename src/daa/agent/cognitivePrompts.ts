/**
 * Cognitive Agent — DeepSeek Prompt 模板
 *
 * 每个 LangGraph 节点对应一个专门的 prompt。
 * 所有 prompt 要求 DeepSeek 输出结构化 JSON。
 */

import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import type { ResearchThread, AgentMemory, Surprise, DailyBriefing } from "@/src/daa/agent/cognitiveTypes";
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

## 示例输出
\`\`\`json
{
  "targets": [
    {"threadId": "a1b2c3d4", "reason": "NVDA 权重15%但论点20天未更新，且近期有重大新闻", "dataNeeded": ["technical", "news"]},
    {"threadId": null, "reason": "VIX 突破25但无对应宏观避险论点", "dataNeeded": ["technical"]}
  ],
  "newThreads": [
    {"title": "市场波动率飙升的避险策略", "initialThesis": "VIX 突破25暗示市场恐慌情绪升温，需评估是否增加避险仓位", "assetKeys": ["US:GLD", "US:TLT"], "tags": ["宏观", "避险"]}
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

## 示例输出
\`\`\`json
{
  "thesisChanged": true,
  "updatedThesis": "NVDA 受AI基础设施需求支撑，短期估值偏高但长期增长逻辑未变",
  "newConviction": "medium",
  "evidenceType": "contradicting",
  "evidenceSummary": "技术面RSI超买(78)，估值PE达65x历史高位，但新闻面显示数据中心订单超预期",
  "surprises": [{"title": "数据中心订单超预期", "description": "Q2订单同比增长120%，显著高于市场预期的80%", "relatedThesisId": null, "severityScore": 7, "suggestedAction": "关注下季财报确认趋势"}],
  "invalidationConditions": "PE回落至50x以下且RSI回到60以下",
  "suggestedReviewDays": 7,
  "nextActions": ["追踪竞争对手AMD的AI芯片进展"]
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// ── Surface 节点 Prompt ──

export function buildSurfacePrompt(ctx: {
  portfolio: PortfolioSnapshot;
  market: MarketSnapshot;
  theses: ResearchThread[];
  surprises: Surprise[];
  thesesUpdated: number;
  memoriesCreated: number;
}): string {
  const surpriseText = ctx.surprises.length > 0
    ? ctx.surprises.map(s => `- [${s.severityScore}/10] ${sanitizeForPrompt(s.title, 60)}: ${sanitizeForPrompt(s.description, 100)}`).join("\n")
    : "本次调查无意外发现";

  const thesisText = ctx.theses
    .slice(0, 15)
    .map(t => {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
      const relatedHolding = ctx.portfolio.holdings.find(h => t.assetKeys.includes(h.assetKey));
      const weight = relatedHolding ? (relatedHolding.weightPct * 100).toFixed(1) + "%" : "无持仓";
      return `- "${sanitizeForPrompt(t.title, 50)}" conviction=${t.conviction} 权重=${weight} ${daysSinceUpdate}天前更新`;
    }).join("\n");

  return `你是一个投资研究操作系统的「日报编辑」。请基于今日调查结果生成一份简报。

## 组合概况
总权益: $${ctx.portfolio.totalEquity.toFixed(0)}
现金占比: ${(ctx.portfolio.cashPct * 100).toFixed(1)}%
市场 Regime: ${ctx.market?.regime ?? "unknown"}
VIX: ${ctx.market?.vix ?? "N/A"}

## 今日调查成果
论点更新: ${ctx.thesesUpdated} 个
新记忆: ${ctx.memoriesCreated} 条

## 意外发现
${surpriseText}

## 当前活跃论点
${thesisText}

## 任务
生成三类输出：
1. **今日意外**：最不符合现有认知的变化（从上面的 surprises 中总结，如果没有则说明市场与预期一致）
2. **认知缺口**：哪些持仓权重高（>5%）但论点久未更新（>14天）或 conviction 为 uncertain
3. **改观条件**：当前高 conviction 论点需要什么条件才会改变看法

## 输出格式（严格 JSON）
\`\`\`json
{
  "surprises": [
    { "title": "意外标题", "description": "描述", "relatedThesisId": null, "severityScore": 7, "suggestedAction": "建议" }
  ],
  "cognitionGaps": [
    { "assetKey": "US:NVDA", "portfolioWeight": 0.15, "daysSinceLastInvestigation": 30, "uncertaintyReason": "原因", "suggestedInvestigation": "建议" }
  ],
  "mindChangeConditions": [
    { "thesisTitle": "论点标题", "currentConviction": "high", "conditions": ["条件1"], "monitoringIndicators": ["VIX"] }
  ]
}
\`\`\`

## 示例输出
\`\`\`json
{
  "surprises": [{"title": "黄金突破历史新高", "description": "GLD单日涨幅3.2%，突破$2100，与美元走强矛盾", "relatedThesisId": null, "severityScore": 8, "suggestedAction": "检查避险资产配置是否充足"}],
  "cognitionGaps": [{"assetKey": "US:NVDA", "portfolioWeight": 0.15, "daysSinceLastInvestigation": 22, "uncertaintyReason": "AI芯片竞争格局快速变化", "suggestedInvestigation": "对比AMD MI300X最新benchmark数据"}],
  "mindChangeConditions": [{"thesisTitle": "美股科技股长期看多", "currentConviction": "high", "conditions": ["VIX持续30+超过10个交易日", "10Y国债收益率突破5.5%"], "monitoringIndicators": ["VIX", "TNX"]}]
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// ── Reflect 节点 Prompt ──

export function buildReflectPrompt(ctx: {
  thread: ResearchThread;
  updatedThesis: string;
  newConviction: string;
  evidenceSummary: string;
}): string {
  return `你是一个投资研究操作系统的「首席风控官」。刚刚一个研究论点发生了判断变化，你需要反思。

## 论点变化
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
旧判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
新判断: ${sanitizeForPrompt(ctx.updatedThesis, 200)}
旧信念: ${ctx.thread.conviction} → 新信念: ${ctx.newConviction}

## 证据摘要
${sanitizeForPrompt(ctx.evidenceSummary, 300)}

## 任务
1. 这个变化是否合理？有没有过度反应的风险？
2. 之前有没有类似的判断变化模式？
3. 是否有值得长期记住的教训？

## 输出格式（严格 JSON）
\`\`\`json
{
  "reflectionSummary": "反思总结",
  "overreactionRisk": "low/medium/high",
  "newMemory": {
    "type": "lesson",
    "content": "值得记住的教训（如果有的话，没有则设为 null）"
  }
}
\`\`\`

## 示例输出
\`\`\`json
{
  "reflectionSummary": "从medium调至low属于合理降级，RSI超买+PE高位的双重压力下降低信念合理，但需注意避免在短期波动中频繁调整conviction",
  "overreactionRisk": "low",
  "newMemory": {"type": "pattern", "content": "当RSI>75且PE>历史90%分位时，短期回调概率高，应考虑降低conviction至medium/low"}
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// ── Review 节点 Prompt ──

export function buildReviewPrompt(ctx: {
  thread: ResearchThread;
  marketRegime: string;
  vix: number | null;
  priceChangeText?: string;
}): string {
  return `你是一个投资研究操作系统的「复盘审计师」。以下论点已到复盘日期。

## 论点信息
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
当时判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
信念强度: ${ctx.thread.conviction}
创建时间: ${ctx.thread.createdAt}
${ctx.priceChangeText ? `\n## 实际市场表现${ctx.priceChangeText}` : ""}

## 当前市场
Regime: ${ctx.marketRegime}
VIX: ${ctx.vix ?? "N/A"}

## 任务
基于论点创建时的判断和实际市场表现，评估准确度。accuracyScore 0=完全错误 1=完全准确。

## 输出格式（严格 JSON）
\`\`\`json
{
  "actualOutcome": "实际发生了什么",
  "accuracyScore": 0.7,
  "lesson": "从这次复盘中学到的教训（如果有）",
  "shouldArchive": false
}
\`\`\`

## 示例输出
\`\`\`json
{
  "actualOutcome": "看多NVDA的判断基本正确，期间上涨18%，但波动超预期，中间有一次12%回撤",
  "accuracyScore": 0.7,
  "lesson": "高波动资产即使方向正确也需要设置止损，conviction=high不等于低风险",
  "shouldArchive": false
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// ── Telegram 格式化 ──

export function formatBriefingForTelegram(briefing: DailyBriefing, meta: {
  totalTokens: number;
  durationMs: number;
  thesesCount: number;
  memoriesCount: number;
}): string {
  const lines: string[] = [];
  lines.push("<b>\u{1F9E0} Agent 日报</b>\n");

  if (briefing.surprises.length > 0) {
    lines.push("<b>\u26A1 今日意外</b>");
    for (const s of briefing.surprises.slice(0, 3)) {
      lines.push(`• [${s.severityScore}/10] ${s.title}`);
      lines.push(`  ${s.description.slice(0, 80)}`);
    }
    lines.push("");
  } else {
    lines.push("<b>\u26A1 今日意外</b>\n市场与预期一致，无重大意外。\n");
  }

  if (briefing.cognitionGaps.length > 0) {
    lines.push("<b>\u{1F50D} 认知缺口</b>");
    for (const g of briefing.cognitionGaps.slice(0, 3)) {
      lines.push(`• ${g.assetKey} (权重${(g.portfolioWeight * 100).toFixed(1)}%) — ${g.daysSinceLastInvestigation}天未调查`);
    }
    lines.push("");
  }

  if (briefing.mindChangeConditions.length > 0) {
    lines.push("<b>\u{1F504} 改观条件</b>");
    for (const m of briefing.mindChangeConditions.slice(0, 3)) {
      lines.push(`• "${m.thesisTitle}" (${m.currentConviction})`);
      lines.push(`  改变条件: ${m.conditions.slice(0, 2).join("; ")}`);
    }
    lines.push("");
  }

  lines.push(`<i>\u{1F4CA} 论点: ${meta.thesesCount} | 记忆: ${meta.memoriesCount} | Tokens: ${meta.totalTokens} | ${(meta.durationMs / 1000).toFixed(1)}s</i>`);
  return lines.join("\n");
}
