/**
 * Cognitive Agent — DeepSeek Prompt 模板
 *
 * 每个 LangGraph 节点对应一个专门的 prompt。
 * 所有 prompt 要求 DeepSeek 输出结构化 JSON。
 */

import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import type { ResearchThread, AgentMemory, Surprise, DailyBriefing, ToolCallRecord, ReasoningTrace, MindChangeCondition, CognitionGap } from "@/src/daa/agent/cognitiveTypes";
import type { MarketSnapshot, PortfolioSnapshot, WatchlistSnapshot, NewsSnapshot } from "@/src/daa/agent/cognitiveState";
import { formatAssetLabel, formatAssetLabelByKey } from "@/src/daa/assetRegistry";

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
      return `[id=${t.id}] "${sanitizeForPrompt(t.title, 60)}" conviction=${t.conviction}${accStr} 资产=${t.assetKeys.join(",")}`;
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
      "threadId": "完整论点ID或null（null表示新建；不要只返回8位短ID）",
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
    {"threadId": "a1b2c3d4-1111-2222-3333-444455556666", "reason": "NVDA 权重15%但论点20天未更新，且近期有重大新闻", "dataNeeded": ["technical", "news"]},
    {"threadId": null, "reason": "VIX 突破25但无对应宏观避险论点", "dataNeeded": ["technical"]}
  ],
  "newThreads": [
    {"title": "市场波动率飙升的避险策略", "initialThesis": "VIX 突破25暗示市场恐慌情绪升温，需评估是否增加避险仓位", "assetKeys": ["US:GLD", "US:TLT"], "tags": ["宏观", "避险"]}
  ]
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
    "surprises": [
      { "title": "意外简述", "description": "一句话客观描述矛盾/突发", "relatedThesisId": null, "severityScore": 7, "suggestedAction": "建议动作" }
    ],
    "invalidationConditions": "失效条件",
    "suggestedReviewDays": 14,
    "nextActions": ["下一步方向"]
  }
}
\`\`\`

**surprises 字段规则（必须遵守）：**
- 每一项必须是上面示例的对象结构，**不能是字符串**，也不能缺 title / severityScore 字段
- severityScore 为 1-10 的整数；日常观察不算意外（severityScore < 3 的系统会自动丢弃）
- 没有真实意外时返回空数组 \`[]\`，不要塞占位条目

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
  previousBriefing?: { mindChangeConditions: MindChangeCondition[] } | null;
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

  // P0-3: 上次日报对比（“自动跟踪清单”已改由代码直出，无需作为上次对比项）
  const prevBriefingText = ctx.previousBriefing
    ? (() => {
        const prevConditions = (ctx.previousBriefing.mindChangeConditions ?? [])
          .slice(0, 5)
          .map(c => `- "${sanitizeForPrompt(c.thesisTitle, 40)}" (${c.currentConviction}): ${c.conditions.slice(0, 2).map(s => sanitizeForPrompt(s, 60)).join("; ")}`)
          .join("\n");
        return `## 上次日报（对比参考）
改观条件:
${prevConditions || "无"}

⚠️ 重要：如果改观条件与上次完全相同，请明确写"条件未变，持续监控"。如果有新的观察或数据支持，请更新条件描述。避免逐字重复上次内容。`;
      })()
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
${prevBriefingText}

## 任务
生成两类输出（“自动跟踪清单”由系统代码直出，无需你生成）：
1. **今日意外**：最不符合现有认知的变化（从上面的 surprises 和工具调用结果中总结）。如果没有实质性意外，**必须**返回空数组 \`[]\`，**不要**生成"市场与预期一致"等占位条目；系统会在输出为空时自动展示 fallback 文案。仅当 severityScore >= 3 的真实矛盾信息才值得输出。
2. **改观条件**：当前高 conviction 论点需要什么条件才会改变看法。基于本次调查的具体数据给出条件，不要泛泛而谈。

## 输出格式（严格 JSON）
\`\`\`json
{
  "surprises": [
    { "title": "意外标题", "description": "描述", "relatedThesisId": null, "severityScore": 7, "suggestedAction": "建议" }
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
  "mindChangeConditions": [{"thesisTitle": "美股科技股长期看多", "currentConviction": "high", "conditions": ["VIX持续30+超过10个交易日", "10Y国债收益率突破5.5%"], "monitoringIndicators": ["VIX", "TNX"]}]
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// ── 策略顾问 Prompt（surfaceNode 末尾，生成目标权重计划） ──

export function buildStrategyAdvisorPrompt(ctx: {
  holdings: Array<{ assetKey: string; symbol: string; weightPct: number; price: number }>;
  watchlist?: WatchlistSnapshot["candidates"];
  theses: ResearchThread[];
  surprises: Array<{ title: string; severityScore: number; suggestedAction: string }>;
  cognitionGaps: Array<{ assetKey: string; portfolioWeight: number; daysSinceLastInvestigation: number; uncertaintyReason?: string; suggestedInvestigation?: string }>;
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

  const watchlistLines = (ctx.watchlist ?? []).slice(0, 40).map(w => {
    const thesis = ctx.theses.find(t => t.assetKeys.includes(w.assetKey));
    const tags = w.tags.length > 0 ? ` tags=${w.tags.slice(0, 3).join("/")}` : "";
    const target = w.targetWeightPct > 0 ? ` 规则目标${w.targetWeightPct.toFixed(1)}%` : "";
    const autoEntry = w.autoEntryEnabled ? "规则自动建仓=开" : "规则自动建仓=关";
    const note = w.notes ? ` notes="${sanitizeForPrompt(w.notes, 50)}"` : "";
    return `${w.symbol} (${w.assetKey}) 现价$${w.lastPrice.toFixed(2)} ${autoEntry}${target}${tags}${note}${thesis ? ` 论点="${sanitizeForPrompt(thesis.title, 40)}" conviction=${thesis.conviction}` : " 无论点"}`;
  }).join("\n") || "无";

  const surpriseLines = ctx.surprises.length > 0
    ? ctx.surprises.map(s => `[${s.severityScore}/10] ${sanitizeForPrompt(s.title, 60)}`).join("\n")
    : "无意外";

  const gapLines = ctx.cognitionGaps.length > 0
    ? ctx.cognitionGaps.map(g => `${g.assetKey} 权重${(g.portfolioWeight * 100).toFixed(1)}%：${sanitizeForPrompt(g.uncertaintyReason || `${g.daysSinceLastInvestigation}天未更新`, 90)}${g.suggestedInvestigation ? `；${sanitizeForPrompt(g.suggestedInvestigation, 90)}` : ""}`).join("\n")
    : "无";

  return `你是投资组合的「策略顾问」。基于当前组合状况和论点分析，输出你对规则引擎参数的建议。

## 当前持仓
${holdingLines}

## 观察列表候选
${watchlistLines}

## 活跃论点
${thesisLines}

## 今日意外
${surpriseLines}

## 自动跟踪项
${gapLines}

## 当前执行约束
- 市场 regime (规则判定): ${ctx.ruleRegime}
- 单资产目标权重硬上限: ${(ctx.maxPositionPct * 100).toFixed(0)}%

## 任务
根据你的分析输出 JSON 目标权重计划：

1. **regimeOverride**: 你是否同意规则引擎的 regime 判断？如果不同意且置信度 >= 80，给出你的判断。同意则设为 null。
2. **targetAllocationPlan**: 如果你希望 AI 全权调仓，请直接给出“最终目标权重”。执行层会把目标权重差额转成 BUY/SELL 订单，并继续执行硬风控；低置信度不要输出。

## 输出格式（严格 JSON）
\`\`\`json
{
  "regimeOverride": null,
  "targetAllocationPlan": null
}
\`\`\`

## 示例输出
\`\`\`json
{
  "regimeOverride": {"suggestedRegime": "risk_off", "confidence": 82, "reasoning": "信用利差HYG/LQD持续走阔但VIX尚未反应，规则引擎滞后", "ruleBasedRegime": "${ctx.ruleRegime}"},
  "targetAllocationPlan": {"reasoning": "TSLA论点崩塌，主动降至观察仓；现金保留为防守缓冲", "intents": [{"symbol": "TSLA", "assetKey": "US::TSLA", "proposedTargetWeightPct": 3, "confidence": 86, "reasoning": "论点失效且波动放大"}]}
}
\`\`\`

规则:
- proposedTargetWeightPct 使用百分比口径，例如 3 表示 3%；自动执行时会被单仓上限截断
- 可以对观察列表候选给出新目标权重；这会生成 BUY 提案。可以对当前持仓给出更低目标权重甚至 0；这会生成 SELL 提案。
- targetAllocationPlan.intents 只列需要改变目标权重的资产；confidence < 70 不会自动采纳
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

function normalizeBriefingText(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function formatBriefingTextExcerpt(text: string, charLimit: number): string {
  const normalized = normalizeBriefingText(text);
  if (normalized.length <= charLimit) return normalized;

  const head = normalized.slice(0, charLimit);
  const minBoundary = Math.max(24, Math.floor(charLimit * 0.45));
  let boundary = -1;

  for (let i = head.length - 1; i >= minBoundary; i -= 1) {
    const ch = head[i];
    if ("。！？；;!?".includes(ch)) {
      boundary = i + 1;
      break;
    }
    if (ch === "." && !/\d/.test(head[i - 1] || "") && !/\d/.test(normalized[i + 1] || "")) {
      boundary = i + 1;
      break;
    }
  }

  if (boundary < 0) {
    for (let i = head.length - 1; i >= minBoundary; i -= 1) {
      if ("，,、 ".includes(head[i])) {
        boundary = i;
        break;
      }
    }
  }

  const clipped = (boundary > 0 ? head.slice(0, boundary) : head).trim();
  return clipped.endsWith("…") ? clipped : `${clipped}…`;
}

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
    const holdingsValue = p.holdings.reduce((s, h) => s + (h.valuationBase ?? 0), 0);
    lines.push("<b>\u{1F4B0} 组合概览</b>");
    lines.push(`总权益 <code>$${fmtK(p.totalEquity)}</code> | 持仓 <code>$${fmtK(holdingsValue)}</code> (${p.holdings.length}个) | 现金 <code>${(p.cashPct * 100).toFixed(0)}%</code>`);
    lines.push("");

    // 持仓明细（top 8）
    if (p.holdings.length > 0) {
      const sorted = [...p.holdings].sort((a, b) => (b.valuationBase ?? 0) - (a.valuationBase ?? 0));
      lines.push("<b>\u{1F4CB} 持仓</b>");
      for (const h of sorted.slice(0, 8)) {
        const pnl = h.unrealizedPnlPct != null ? `${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}%` : "";
        lines.push(`• ${formatAssetLabel({ symbol: h.symbol, assetKey: h.assetKey })} ${(h.weightPct * 100).toFixed(1)}% $${fmtK(h.valuationBase ?? 0)} ${pnl}`);
      }
      lines.push("");
    }
  }

  // ── Agent 分析 ──
  if (briefing.surprises.length > 0) {
    lines.push("<b>\u26A1 今日意外</b>");
    for (const s of briefing.surprises.slice(0, 3)) {
      lines.push(`• [${s.severityScore}/10] ${s.title}`);
      lines.push(`  ${formatBriefingTextExcerpt(s.description, 160)}`);
    }
    lines.push("");
  } else {
    lines.push("<b>\u26A1 今日意外</b>\n市场与预期一致，无重大意外。\n");
  }

  if (briefing.cognitionGaps.length > 0) {
    lines.push("<b>\u{1F50D} 持仓论点待复核</b>");
    for (const g of briefing.cognitionGaps.slice(0, 3)) {
      lines.push(`• ${formatAssetLabelByKey(g.assetKey)} — ${g.uncertaintyReason}`);
      if (g.suggestedInvestigation) {
        lines.push(`  ↳ ${g.suggestedInvestigation}`);
      }
    }
    lines.push("");
  }

  if (briefing.autopilotCoverage) {
    const c = briefing.autopilotCoverage;
    lines.push("<b>\u{1F9ED} 自动驾驶覆盖</b>");
    lines.push(`• 持仓复核 <code>${c.holdingAssets}</code> 个 | 观察候选 <code>${c.watchlistCandidates}</code> 个 | 大脑目标计划 <code>${c.acceptedBrainPlanIntents}/${c.brainPlanIntents}</code> 条`);
    if (c.watchlistCandidates > 0) {
      lines.push(`• 规则建仓准备度: 已开启 <code>${c.ruleAutoEntryEnabled}</code> 个 | 已设规则目标 <code>${c.watchlistWithRuleTarget}</code> 个`);
    }
    if (c.skipReasonSummary.length > 0) {
      const reasons = c.skipReasonSummary.slice(0, 3).map(r => `${r.reason}×${r.count}`).join("；");
      lines.push(`• 规则建仓跳过: ${reasons}`);
    }
    lines.push("");
  }

  if (briefing.mindChangeConditions.length > 0) {
    lines.push("<b>\u{1F504} 改观条件</b>");
    for (const m of briefing.mindChangeConditions.slice(0, 3)) {
      lines.push(`• "${m.thesisTitle}" (${m.currentConviction})`);
      lines.push(`  改变条件: ${formatBriefingTextExcerpt(m.conditions.slice(0, 2).join("; "), 260)}`);
    }
    lines.push("");
  }

  // ── 风险暴露（论点失效的组合影响） ──
  const failureImpacts = briefing.thesisFailureImpacts ?? [];
  if (failureImpacts.length > 0) {
    // 只展示 medium 及以上 riskLevel，按估损从高到低
    const ranked = [...failureImpacts]
      .filter(i => i.riskLevel === "medium" || i.riskLevel === "high" || i.riskLevel === "critical")
      .sort((a, b) => b.estimatedLossPct - a.estimatedLossPct)
      .slice(0, 3);
    if (ranked.length > 0) {
      lines.push("<b>\u{26A0}\u{FE0F} 风险暴露</b> <i>(论点失效的假设情景)</i>");
      for (const i of ranked) {
        const levelLabel = i.riskLevel === "critical" ? "严重" : i.riskLevel === "high" ? "高" : "中";
        const assets = i.affectedAssets.slice(0, 3).map(a => formatAssetLabelByKey(a.assetKey)).join(", ");
        lines.push(`• [${levelLabel}] "${i.thesisTitle}" (${i.conviction})`);
        lines.push(`  相关持仓约 ${(i.totalExposurePct * 100).toFixed(1)}%；若该论点被证伪，优先复核这些资产的目标权重、止损和降仓条件：${assets}`);
      }
      lines.push("");
    }
  }

  // ── 论点冲突 ──
  const conflicts = briefing.thesisConflicts ?? [];
  if (conflicts.length > 0) {
    const ranked = [...conflicts]
      .sort((a, b) => {
        const rank = (s: string) => s === "high" ? 2 : s === "medium" ? 1 : 0;
        return rank(b.severity) - rank(a.severity);
      })
      .slice(0, 3);
    lines.push("<b>\u{26A1} 论点冲突</b>");
    for (const c of ranked) {
      const sevLabel = c.severity === "high" ? "高" : c.severity === "medium" ? "中" : "低";
      const assets = c.overlappingAssets.slice(0, 3).map(k => formatAssetLabelByKey(k)).join(", ");
      lines.push(`• [${sevLabel}] "${c.thesisA.title}" (${c.thesisA.conviction}) × "${c.thesisB.title}" (${c.thesisB.conviction})`);
      lines.push(`  冲突资产: ${assets}`);
    }
    lines.push("");
  }

  // ── Agent 目标权重计划（如有） ──
  const ov = briefing.configOverlay ?? null;
  const strategyLines: string[] = [];
  if (ov?.regimeOverride) {
    strategyLines.push(`Regime: ${ov.regimeOverride.ruleBasedRegime}→${ov.regimeOverride.suggestedRegime} (${ov.regimeOverride.confidence}%)`);
  }
  const intents = ov?.targetAllocationPlan?.intents ?? [];
  if (intents.length > 0) {
    const topIntents = intents.slice(0, 4).map(i => {
      const label = i.symbol || formatAssetLabelByKey(i.assetKey);
      return `${label}→${i.proposedTargetWeightPct.toFixed(1)}% (${i.confidence.toFixed(0)}%)`;
    }).join(", ");
    strategyLines.push(`目标权重: ${topIntents}`);
    if (ov?.targetAllocationPlan?.reasoning) {
      strategyLines.push(`理由: ${formatBriefingTextExcerpt(ov.targetAllocationPlan.reasoning, 220)}`);
    }
  } else if (briefing.cognitionGaps.length > 0 || (briefing.autopilotCoverage?.watchlistCandidates ?? 0) > 0) {
    strategyLines.push("本轮未形成高置信度目标权重计划；执行层不会仅因观察态论点或观察列表存在而直接调仓。");
  }
  if (strategyLines.length > 0) {
    lines.push("<b>\u{1F916} 策略建议</b>");
    for (const part of strategyLines) lines.push(`• ${part}`);
    lines.push("");
  }

  lines.push(`<i>\u{1F4CA} 论点: ${meta.thesesCount} | 记忆: ${meta.memoriesCount}</i>`);
  return lines.join("\n");
}

function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
