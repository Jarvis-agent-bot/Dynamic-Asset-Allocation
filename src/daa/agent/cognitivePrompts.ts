/**
 * Cognitive Agent — DeepSeek Prompt 模板
 *
 * 每个 LangGraph 节点对应一个专门的 prompt。
 * 所有 prompt 要求 DeepSeek 输出结构化 JSON。
 */

import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import type { ResearchThread, AgentMemory, Surprise, DailyBriefing, ToolCallRecord, ReasoningTrace, MindChangeCondition, CognitionGap } from "@/src/daa/agent/cognitiveTypes";
import type { MarketSnapshot, PortfolioSnapshot, NewsSnapshot } from "@/src/daa/agent/cognitiveState";
// V1 compat types removed — buildReactFollowUpPrompt now uses inline type

// ── Prioritize 节点 Prompt ──

export function buildPrioritizePrompt(ctx: {
  portfolio: PortfolioSnapshot;
  market: MarketSnapshot;
  news: NewsSnapshot;
  theses: ResearchThread[];
  /** 2B: 每个 thesis 的历史准确率（0-1），用于指导优先级 */
  thesisAccuracy?: Map<string, number>;
}): string {
  const holdingSummary = ctx.portfolio.holdings
    .slice(0, 30)
    .map(h => `${h.assetKey} 权重${(h.weightPct * 100).toFixed(1)}% PnL${h.unrealizedPnlPct != null ? (h.unrealizedPnlPct * 100).toFixed(1) + "%" : "N/A"}`)
    .join("\n");

  const thesisSummary = ctx.theses
    .slice(0, 15)
    .map(t => {
      const acc = ctx.thesisAccuracy?.get(t.id);
      const accStr = acc != null ? ` 准确率=${(acc * 100).toFixed(0)}%` : "";
      return `[${t.id.slice(0, 8)}] "${sanitizeForPrompt(t.title, 60)}" conviction=${t.conviction}${accStr} 资产=${t.assetKeys.join(",")}`;
    })
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
   - 历史准确率低（<50%）的论点需要重新审视
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

// ── Investigate ReAct Prompt（V2：结构化段落，由 ContextManager 管理）──

/**
 * V2: 返回结构化段落（供 ContextManager 分层管理）。
 *
 * 返回结构化段落（供 ContextManager 分层管理）。
 */
export function buildReactInvestigatePromptSections(ctx: {
  thread: ResearchThread;
  toolDefinitionsV2Text?: string;
  memories: AgentMemory[];
  portfolio: PortfolioSnapshot;
  tradeOutcomes?: Array<{ content: string; evidenceType: string; createdAt: string }>;
}): {
  system: string;
  thesis: string;
  portfolio: string;
  memory: string;
  tradeFeedback: string;
  tools: string;
  rules: string;
} {
  const memoryText = ctx.memories.length > 0
    ? ctx.memories.map(m => `- [${m.memoryType}] ${sanitizeForPrompt(m.content, 100)}`).join("\n")
    : "无相关历史记忆";

  const portfolioText = ctx.portfolio.holdings
    .filter(h => ctx.thread.assetKeys.includes(h.assetKey))
    .map(h => `${h.assetKey}: 权重${(h.weightPct * 100).toFixed(1)}% PnL=${h.unrealizedPnlPct != null ? (h.unrealizedPnlPct * 100).toFixed(1) + "%" : "N/A"}`)
    .join("\n") || "无相关持仓";

  const tradeFeedbackText = ctx.tradeOutcomes?.length
    ? ctx.tradeOutcomes.slice(0, 5).map(t => `- [${t.evidenceType}] ${sanitizeForPrompt(t.content, 120)}`).join("\n")
    : "";

  return {
    system: `你是一个投资研究操作系统的「研究分析师」。你正在深入调查一个研究论点。`,

    thesis: `## 当前论点
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
信念强度: ${ctx.thread.conviction}
失效条件: ${ctx.thread.invalidationConditions ? sanitizeForPrompt(ctx.thread.invalidationConditions, 150) : "未定义"}
关联资产: ${ctx.thread.assetKeys.join(", ")}`,

    portfolio: `## 组合背景\n${portfolioText}`,

    memory: `## 历史记忆\n${memoryText}`,

    tradeFeedback: tradeFeedbackText ? `## 交易反馈\n${tradeFeedbackText}` : "",

    tools: `## 可用工具\n你可以调用以下工具来收集证据。每次可调用 1-3 个工具。\n\n${ctx.toolDefinitionsV2Text ?? ""}`,

    rules: `## 操作规则
1. 分析论点，决定需要哪些数据来验证/反驳它
2. 选择合适的工具并指定参数
3. 你有最多 5 轮工具调用机会，请合理规划
4. 当你认为证据充分时，直接给出最终分析结论
5. 工具分为四类：观察类（只读查询）、分析类（计算推导）、自省类（历史反思）、行动类（需确认）
6. 链式引用：在后续轮次中，可以用 $tool_results.{工具名}.{字段名} 引用前序工具的输出字段

## 输出格式（严格 JSON，二选一）

**选择工具（需要更多数据时）：**
\`\`\`json
{
  "action": "tool_calls",
  "tool_calls": [
    { "name": "fetch_technical_signal", "params": { "symbol": "AAPL" } }
  ],
  "reasoning": "为什么选择这些工具的简要说明"
}
\`\`\`

**最终结论（证据充分时）：**
\`\`\`json
{
  "action": "result",
  "result": {
    "thesisChanged": true,
    "updatedThesis": "更新后的判断或null",
    "newConviction": "high/medium/low/uncertain 或 null",
    "evidenceType": "supporting/contradicting/neutral",
    "evidenceSummary": "关键证据摘要",
    "surprises": [],
    "invalidationConditions": "失效条件",
    "suggestedReviewDays": 14,
    "nextActions": ["下一步方向"]
  }
}
\`\`\`

首先调用工具收集数据，然后给出结论。只输出 JSON，不要其他文字。`,
  };
}

/**
 * Phase B: 工具结果反馈 — 将工具返回的数据追加到上下文，让 LLM 继续推理。
 */
export function buildReactFollowUpPrompt(ctx: {
  toolResults: Array<{ toolName: string; success: boolean; data: unknown; error?: string; latencyMs?: number }>;
  roundNumber: number;
  maxRounds: number;
}): string {
  const resultsText = ctx.toolResults.map(r => {
    const status = r.success ? "✓ 成功" : "✗ 失败";
    const dataStr = r.success
      ? JSON.stringify(r.data, null, 0).slice(0, 600)
      : (r.error ?? "未知错误");
    return `### ${r.toolName} [${status}, ${r.latencyMs ?? 0}ms]\n${dataStr}`;
  }).join("\n\n");

  const remainingRounds = ctx.maxRounds - ctx.roundNumber;

  return `## 工具执行结果（第 ${ctx.roundNumber} 轮，剩余 ${remainingRounds} 轮）

${resultsText}

基于以上数据，你可以：
1. 调用更多工具获取额外数据（还剩 ${remainingRounds} 轮）
2. 给出最终分析结论

${remainingRounds <= 1 ? "⚠️ 这是最后一轮，请务必给出最终结论（action=result）。" : ""}

输出格式与之前相同（action=tool_calls 或 action=result）。只输出 JSON，不要其他文字。`;
}

// ── Surface 节点 Prompt ──

export function buildSurfacePrompt(ctx: {
  portfolio: PortfolioSnapshot;
  market: MarketSnapshot;
  theses: ResearchThread[];
  surprises: Surprise[];
  thesesUpdated: number;
  memoriesCreated: number;
  toolsCalled?: ToolCallRecord[];
  reasoningTraces?: ReasoningTrace[];
  previousBriefing?: { mindChangeConditions: MindChangeCondition[]; cognitionGaps: CognitionGap[] } | null;
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

  // P0-2: 工具调用结果摘要 — 让 LLM 基于新鲜数据生成差异化内容
  const toolsText = (ctx.toolsCalled ?? []).length > 0
    ? (ctx.toolsCalled ?? []).slice(0, 15).map(t =>
        `- ${t.tool}(${Object.values(t.input).join(",") || "无参数"}) → ${sanitizeForPrompt(t.outputSummary, 150)} [${t.durationMs}ms]`
      ).join("\n")
    : "本次无工具调用";

  const tracesText = (ctx.reasoningTraces ?? []).length > 0
    ? (ctx.reasoningTraces ?? [])
        .filter(t => t.node === "investigate")
        .slice(0, 5)
        .map(t => `- [${t.node}] ${sanitizeForPrompt(t.input, 80)} → ${sanitizeForPrompt(t.output, 120)}`)
        .join("\n")
    : "";

  // P0-3: 上次日报对比
  const prevBriefingText = ctx.previousBriefing
    ? (() => {
        const prevConditions = (ctx.previousBriefing.mindChangeConditions ?? [])
          .slice(0, 5)
          .map(c => `- "${sanitizeForPrompt(c.thesisTitle, 40)}" (${c.currentConviction}): ${c.conditions.slice(0, 2).map(s => sanitizeForPrompt(s, 60)).join("; ")}`)
          .join("\n");
        const prevGaps = (ctx.previousBriefing.cognitionGaps ?? [])
          .slice(0, 5)
          .map(g => `- ${g.assetKey} 权重${(g.portfolioWeight * 100).toFixed(1)}% ${g.daysSinceLastInvestigation}天未调查`)
          .join("\n");
        return `## 上次日报（对比参考）
改观条件:
${prevConditions || "无"}
认知缺口:
${prevGaps || "无"}

⚠️ 重要：如果改观条件与上次完全相同，请明确写"条件未变，持续监控"。如果有新的观察或数据支持，请更新条件描述。避免逐字重复上次内容。`;
      })()
    : "";

  // P1-2: 预计算认知缺口标注
  const gapWarnings = ctx.theses
    .filter(t => {
      const days = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
      const relatedHolding = ctx.portfolio.holdings.find(h => t.assetKeys.includes(h.assetKey));
      const weight = relatedHolding?.weightPct ?? 0;
      return (days > 7 && weight > 0.05) || t.conviction === "uncertain";
    })
    .map(t => {
      const days = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
      const relatedHolding = ctx.portfolio.holdings.find(h => t.assetKeys.includes(h.assetKey));
      const weight = relatedHolding ? (relatedHolding.weightPct * 100).toFixed(1) + "%" : "?";
      return `⚠️ ${t.assetKeys.join(",")} 权重${weight} 已${days}天未更新 conviction=${t.conviction}`;
    });
  const gapWarningText = gapWarnings.length > 0
    ? `\n## 系统检测到的认知缺口（必须包含在输出中）\n${gapWarnings.join("\n")}`
    : "";

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

## 今日调查详情
### 工具调用
${toolsText}
${tracesText ? `### 调查结论\n${tracesText}` : ""}

## 当前活跃论点
${thesisText}
${gapWarningText}
${prevBriefingText}

## 任务
生成三类输出：
1. **今日意外**：最不符合现有认知的变化（从上面的 surprises 和工具调用结果中总结，如果没有则说明市场与预期一致）
2. **认知缺口**：哪些持仓权重高（>5%）但论点久未更新（>7天）或 conviction 为 uncertain。系统已预检测，请确保输出包含所有标注的缺口。
3. **改观条件**：当前高 conviction 论点需要什么条件才会改变看法。基于本次调查的具体数据给出条件，不要泛泛而谈。

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

// ── 策略顾问 Prompt（surfaceNode 末尾，生成 Config Overlay） ──

export function buildStrategyAdvisorPrompt(ctx: {
  holdings: Array<{ assetKey: string; symbol: string; weightPct: number; price: number }>;
  theses: ResearchThread[];
  surprises: Array<{ title: string; severityScore: number; suggestedAction: string }>;
  cognitionGaps: Array<{ assetKey: string; portfolioWeight: number; daysSinceLastInvestigation: number }>;
  ruleRegime: string;
  defaultDriftThresholdPct: number;
  maxPositionPct: number;
}): string {
  const holdingLines = ctx.holdings.slice(0, 30).map(h => {
    const thesis = ctx.theses.find(t => t.assetKeys.includes(h.assetKey));
    return `${h.symbol} (${h.assetKey}) 权重${(h.weightPct * 100).toFixed(1)}% 现价$${h.price.toFixed(2)}${thesis ? ` 论点="${sanitizeForPrompt(thesis.title, 40)}" conviction=${thesis.conviction}` : " 无论点"}`;
  }).join("\n");

  const thesisLines = ctx.theses.slice(0, 15).map(t =>
    `"${sanitizeForPrompt(t.title, 50)}" conviction=${t.conviction} 资产=${t.assetKeys.join(",")} 失效条件=${sanitizeForPrompt(t.invalidationConditions ?? "无", 60)}`
  ).join("\n");

  const surpriseLines = ctx.surprises.length > 0
    ? ctx.surprises.map(s => `[${s.severityScore}/10] ${sanitizeForPrompt(s.title, 60)}`).join("\n")
    : "无意外";

  const gapLines = ctx.cognitionGaps.length > 0
    ? ctx.cognitionGaps.map(g => `${g.assetKey} 权重${(g.portfolioWeight * 100).toFixed(1)}% ${g.daysSinceLastInvestigation}天未调查`).join("\n")
    : "无";

  return `你是投资组合的「策略顾问」。基于当前组合状况和论点分析，输出你对规则引擎参数的建议。

## 当前持仓
${holdingLines}

## 活跃论点
${thesisLines}

## 今日意外
${surpriseLines}

## 认知缺口
${gapLines}

## 当前规则引擎设置
- 默认漂移阈值: ${(ctx.defaultDriftThresholdPct * 100).toFixed(1)}%
- 市场 regime (规则判定): ${ctx.ruleRegime}
- 最大单仓位: ${(ctx.maxPositionPct * 100).toFixed(0)}%

## 任务
根据你的分析输出 JSON 参数建议：

1. **driftOverrides**: 哪些资产需要不同于默认的漂移阈值？高 conviction bearish 论点的资产应收紧阈值（更敏感），低 conviction 或无论点的放宽。只列出需要调整的。
2. **regimeOverride**: 你是否同意规则引擎的 regime 判断？如果不同意且置信度 >= 80，给出你的判断。同意则设为 null。
3. **riskAdjustments**: 哪些资产需要收紧仓位上限？只能收紧不能放宽。
4. **rebalanceTrigger**: 你是否认为现在应该触发调仓？只在有明确理由时设为 recommended: true。

## 输出格式（严格 JSON）
\`\`\`json
{
  "driftOverrides": [
    {"symbol": "AAPL", "assetKey": "US:AAPL", "recommendedThresholdPct": 0.03, "reasoning": "高conviction bearish论点，需收紧监控"}
  ],
  "regimeOverride": null,
  "riskAdjustments": [
    {"symbol": "NVDA", "assetKey": "US:NVDA", "maxPositionPctOverride": 0.20, "reasoning": "集中度过高且论点面临AI竞争风险"}
  ],
  "rebalanceTrigger": null
}
\`\`\`

## 示例输出
\`\`\`json
{
  "driftOverrides": [
    {"symbol": "TSLA", "assetKey": "US:TSLA", "recommendedThresholdPct": 0.03, "reasoning": "conviction从high降至low，波动率高，需紧盯"},
    {"symbol": "BND", "assetKey": "US:BND", "recommendedThresholdPct": 0.10, "reasoning": "债券配置稳定，无需频繁调整"}
  ],
  "regimeOverride": {"suggestedRegime": "risk_off", "confidence": 82, "reasoning": "信用利差HYG/LQD持续走阔但VIX尚未反应，规则引擎滞后", "ruleBasedRegime": "${ctx.ruleRegime}"},
  "riskAdjustments": [],
  "rebalanceTrigger": {"recommended": true, "urgency": "normal", "reasoning": "TSLA论点崩塌+仓位超配，建议减仓至目标权重", "affectedAssets": ["US:TSLA"]}
}
\`\`\`

规则:
- recommendedThresholdPct 范围: 0.02 ~ 0.15（低于2%或高于15%的建议无效）
- maxPositionPctOverride 范围: 0.10 ~ 0.30（低于10%或高于30%的建议无效）
- regimeOverride.confidence < 80 时不会被采纳
- 保守为主，只在有充分理由时给出非默认建议

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
  /** 可选: 持仓快照 — 传入后追加持仓明细和漂移监控 */
  portfolio?: {
    holdings: Array<{ assetKey: string; symbol: string; weightPct: number; lastPrice: number; unrealizedPnlPct: number | null; holdingQty: number; targetWeightHint?: number; gapPct?: number | null; valuationBase?: number | null }>;
    totalEquity: number;
    cashPct: number;
    cash?: number;
    marketRegime?: string;
  };
}): string {
  const lines: string[] = [];
  lines.push("<b>\u{1F9E0} Agent 日报</b>\n");

  // ── 持仓概览（从 portfolio 合并） ──
  if (meta.portfolio) {
    const p = meta.portfolio;
    const holdingsValue = p.holdings.reduce((s, h) => s + (h.valuationBase ?? h.lastPrice * h.holdingQty), 0);
    lines.push("<b>\u{1F4B0} 组合概览</b>");
    lines.push(`总权益 <code>$${fmtK(p.totalEquity)}</code> | 持仓 <code>$${fmtK(holdingsValue)}</code> (${p.holdings.length}个) | 现金 <code>${(p.cashPct * 100).toFixed(0)}%</code>`);
    lines.push("");

    // 持仓明细（top 8）
    if (p.holdings.length > 0) {
      const sorted = [...p.holdings].sort((a, b) => (b.valuationBase ?? 0) - (a.valuationBase ?? 0));
      lines.push("<b>\u{1F4CB} 持仓</b>");
      for (const h of sorted.slice(0, 8)) {
        const pnl = h.unrealizedPnlPct != null ? `${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}%` : "";
        lines.push(`• ${h.symbol} ${(h.weightPct * 100).toFixed(1)}% $${fmtK(h.valuationBase ?? h.lastPrice * h.holdingQty)} ${pnl}`);
      }
      lines.push("");
    }
  }

  // ── Agent 分析 ──
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

  // ── Overlay 策略建议（如有） ──
  if (briefing.configOverlay) {
    const ov = briefing.configOverlay;
    const parts: string[] = [];
    if (ov.driftOverrides.length > 0) parts.push(`漂移调整: ${ov.driftOverrides.map(o => `${o.symbol}→${(o.recommendedThresholdPct * 100).toFixed(0)}%`).join(", ")}`);
    if (ov.regimeOverride) parts.push(`Regime: ${ov.regimeOverride.ruleBasedRegime}→${ov.regimeOverride.suggestedRegime} (${ov.regimeOverride.confidence}%)`);
    if (ov.rebalanceTrigger?.recommended) parts.push(`\u{26A0}\u{FE0F} 建议调仓: ${ov.rebalanceTrigger.reasoning.slice(0, 60)}`);
    if (parts.length > 0) {
      lines.push("<b>\u{1F916} 策略建议</b>");
      for (const part of parts) lines.push(`• ${part}`);
      lines.push("");
    }
  }

  lines.push(`<i>\u{1F4CA} 论点: ${meta.thesesCount} | 记忆: ${meta.memoriesCount} | Tokens: ${meta.totalTokens} | ${(meta.durationMs / 1000).toFixed(1)}s</i>`);
  return lines.join("\n");
}

function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
