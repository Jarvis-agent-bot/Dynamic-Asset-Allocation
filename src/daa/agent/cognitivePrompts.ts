/**
 * 投资助理复核工作流 — DeepSeek Prompt 模板
 *
 * 每个 LangGraph 节点对应一个专门的 prompt。
 * 所有 prompt 要求 DeepSeek 输出结构化 JSON。
 */

import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import type { ResearchThread, AgentMemory, Surprise, ToolCallRecord, ReasoningTrace, MindChangeCondition } from "@/src/daa/agent/cognitiveTypes";
import type { MarketSnapshot, PortfolioSnapshot, WatchlistSnapshot, NewsSnapshot, NewsIntelligenceSnapshot } from "@/src/daa/agent/cognitiveState";

// ── Prioritize 节点 Prompt ──

export function buildPrioritizePrompt(ctx: {
  portfolio: PortfolioSnapshot;
  watchlist?: WatchlistSnapshot["candidates"];
  market: MarketSnapshot;
  news: NewsSnapshot;
  newsIntelligence?: NewsIntelligenceSnapshot | null;
  theses: ResearchThread[];
  focusSymbols?: string[];
  maxTargets?: number;
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
    .map((n) => {
      const event = n.majorEvent
        ? ` 重大事件=${n.majorEvent.impact}/${n.majorEvent.type}/${sanitizeForPrompt(n.majorEvent.description, 60)}`
        : "";
      const summary = n.summary ? ` 摘要=${sanitizeForPrompt(n.summary, 80)}` : "";
      const score = n.scorePct != null ? ` 新闻分=${n.scorePct.toFixed(0)}` : "";
      const source = n.source ? ` 来源=${sanitizeForPrompt(n.source, 24)}` : "";
      return `${n.symbol}: ${sanitizeForPrompt(n.title, 80)}${source}${score}${event}${summary}`;
    })
    .join("\n");

  const eventGraphSummary = (ctx.newsIntelligence?.eventGraphs ?? [])
    .slice(0, 8)
    .map((graph) => {
      const related = graph.relatedAssets
        .slice(0, 4)
        .map((asset) => asset.displayNameZh ? `${asset.displayNameZh} ${asset.symbol}` : asset.symbol)
        .join(", ");
      return `${graph.symbol}: 主题=${graph.themeLabelZh} 分=${graph.eventScorePct.toFixed(0)} 关联=${related || "无"}`;
    })
    .join("\n");

  const portfolioImpactSummary = (ctx.newsIntelligence?.portfolioImpacts ?? [])
    .slice(0, 10)
    .map((impact) => `${impact.assetKey}: ${impact.impactScope}/${impact.impactLevel} 分=${impact.impactScorePct.toFixed(0)} 动作=${impact.recommendedAction} 原因=${sanitizeForPrompt(impact.reasonZh, 90)}`)
    .join("\n");

  const discoverySummary = (ctx.newsIntelligence?.discoveryCandidates ?? [])
    .slice(0, 10)
    .map((candidate) => `${candidate.assetKey}: 主题=${candidate.topicLabelZh} 分=${candidate.scorePct.toFixed(0)} 置信=${candidate.confidence} 状态=${candidate.status} 原因=${sanitizeForPrompt(candidate.reasonZh, 90)}`)
    .join("\n");

  const watchlistSummary = (ctx.watchlist ?? [])
    .slice(0, 30)
    .map((w) => {
      const targetPct = w.targetWeightPct > 0 ? w.targetWeightPct : null;
      return `${w.assetKey} 现价${w.lastPrice > 0 ? w.lastPrice.toFixed(2) : "N/A"}${targetPct ? ` 观察目标${targetPct.toFixed(1)}%` : ""}${w.notes ? ` 备注=${sanitizeForPrompt(w.notes, 60)}` : ""}`;
    })
    .join("\n");

  const focusSummary = (ctx.focusSymbols ?? [])
    .map(symbol => String(symbol || "").trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");
  const marketSessionSummary = (ctx.market.sessions ?? [])
    .slice(0, 8)
    .map((row) => `${row.market}: ${row.isOpen ? "开市" : "闭市"} / ${row.reasonCode} / ${row.localDate} ${row.localTime}`)
    .join("\n");
  const maxTargets = Math.max(1, Math.min(10, Math.trunc(Number(ctx.maxTargets) || 5)));

  return `你是一个投资研究操作系统的「投委会主席」。你的职责是决定今天最值得复核的投资判断。

## 当前组合
总权益: $${ctx.portfolio.totalEquity.toFixed(0)}
现金占比: ${(ctx.portfolio.cashPct * 100).toFixed(1)}%
${holdingSummary}

## 观察列表
${watchlistSummary || "无观察列表候选"}

## 市场环境
Regime: ${ctx.market?.regime ?? "unknown"}
VIX: ${ctx.market?.vix ?? "N/A"}
交易时段:
${marketSessionSummary || "无关注市场交易时段"}

## 事件触发资产
${focusSummary || "无"}

## 最近新闻
${newsSummary || "无最新新闻"}

## 新闻智能层
事件图:
${eventGraphSummary || "暂无事件图"}

组合影响:
${portfolioImpactSummary || "暂无组合影响"}

候选发现:
${discoverySummary || "暂无候选发现"}

## 活跃投资判断
${thesisSummary || "暂无活跃投资判断（首次运行）"}

## 任务
1. 从活跃投资判断中选出最需要立即复核的 1-${maxTargets} 个。优先级依据：
   - 事件触发资产相关判断优先
   - 相关资产权重高但 thesis 距上次复核较久
   - 观察列表资产没有稳定方向，且可能进入目标权重计划
   - 新闻与现有 thesis 矛盾
   - 新闻智能层提示 holding/target 为 risk 或 review
   - 候选发现只能作为复核线索，不能被当成自动加入观察列表或自动交易授权
   - conviction 为 "uncertain" 需要明确
   - 历史准确率低（<50%）的判断需要重新审视
2. 如果发现任何不在现有投资判断中的重大变化，建议创建新投资判断。

## 标题规范（必须遵守）
- newThreads.title 必须是不超过 16 个字的**名词短语**（如"科技集中度 vs 利率上行"、"波动率飙升避险"）
- **禁止**把标题写成完整疑问句或长句（如"XX是否需要在YY环境下系统性ZZ"）；详细问题和推理写进 initialThesis

## 输出格式（严格 JSON）
\`\`\`json
{
  "targets": [
    {
      "threadId": "完整投资判断ID或null（null表示新建；不要只返回8位短ID）",
      "reason": "为什么需要复核",
      "dataNeeded": ["technical", "valuation", "news"]
    }
  ],
  "newThreads": [
    {
      "title": "≤16字名词短语标题",
      "initialThesis": "初始判断（详细问题写在这里）",
      "assetKeys": ["US::AAPL"],
      "tags": ["个股"]
    }
  ]
}
\`\`\`

## 示例输出
\`\`\`json
{
  "targets": [
    {"threadId": "a1b2c3d4-1111-2222-3333-444455556666", "reason": "NVDA 权重15%，相关投资判断上次复核在20天前，且近期有重大新闻", "dataNeeded": ["technical", "news"]},
    {"threadId": null, "reason": "VIX 突破25但无对应宏观避险判断", "dataNeeded": ["technical"]}
  ],
  "newThreads": [
    {"title": "波动率飙升避险", "initialThesis": "VIX 突破25暗示市场恐慌情绪升温，需评估是否增加 GLD/TLT 等避险仓位来对冲股票回撤风险", "assetKeys": ["US::GLD", "US::TLT"], "tags": ["宏观", "避险"]}
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
    system: `你是一个投资研究操作系统的「研究分析师」。你正在复核一个投资判断。`,

    thesis: `## 当前投资判断
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
信念强度: ${ctx.thread.conviction}
失效条件: ${ctx.thread.invalidationConditions ? sanitizeForPrompt(ctx.thread.invalidationConditions, 150) : "未定义"}
关联资产: ${ctx.thread.assetKeys.join(", ")}`,

    portfolio: `## 组合背景\n${portfolioText}`,

    memory: `## 历史记忆\n${memoryText}`,

    tradeFeedback: tradeFeedbackText ? `## 交易反馈\n${tradeFeedbackText}` : "",

    tools: `## 可用工具\n你可以调用以下工具来收集复核依据。每次可调用 1-3 个工具。\n\n${ctx.toolDefinitionsV2Text ?? ""}`,

    rules: `## 操作规则
1. 分析投资判断，决定需要哪些数据来验证或反驳它
2. 选择合适的工具并指定参数
3. 你有最多 5 轮工具调用机会，请合理规划
4. 当你认为依据充分时，直接给出最终分析结论
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

**最终结论（依据充分时）：**
\`\`\`json
{
  "action": "result",
  "result": {
    "thesisChanged": true,
    "updatedThesis": "更新后的判断或null",
    "newConviction": "high/medium/low/uncertain 或 null",
    "evidenceType": "supporting/contradicting/neutral",
    "evidenceSummary": "关键依据摘要",
    "surprises": [
      { "title": "新变化简述", "description": "一句话客观描述判断不一致或突发变化", "relatedThesisId": null, "severityScore": 7, "suggestedAction": "建议动作" }
    ],
    "invalidationConditions": "失效条件",
    "suggestedReviewDays": 14,
    "nextActions": ["下一步方向"]
  }
}
\`\`\`

**surprises 字段规则（必须遵守）：**
- 每一项必须是上面示例的对象结构，**不能是字符串**，也不能缺 title / severityScore 字段
- severityScore 为 1-10 的整数；日常观察不算需要复核的变化（severityScore < 3 的系统会自动丢弃）
- 没有真实新变化时返回空数组 \`[]\`，不要塞占位条目

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
    : "本次复核没有发现需要提高优先级的变化";

  const thesisText = ctx.theses
    .slice(0, 15)
    .map(t => {
      const lastInvestigatedAt = t.lastInvestigatedAt || t.updatedAt;
      const daysSinceInvestigation = Math.floor((Date.now() - new Date(lastInvestigatedAt).getTime()) / 86400000);
      const relatedHolding = ctx.portfolio.holdings.find(h => t.assetKeys.includes(h.assetKey));
      const weight = relatedHolding ? (relatedHolding.weightPct * 100).toFixed(1) + "%" : "无持仓";
      return `- "${sanitizeForPrompt(t.title, 50)}" conviction=${t.conviction} 权重=${weight} 相关判断${daysSinceInvestigation}天前复核`;
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

  // P0-3: 上次复核简报对比（“自动跟踪清单”已改由代码直出，无需作为上次对比项）
  const prevBriefingText = ctx.previousBriefing
    ? (() => {
        const prevConditions = (ctx.previousBriefing.mindChangeConditions ?? [])
          .slice(0, 5)
          .map(c => `- "${sanitizeForPrompt(c.thesisTitle, 40)}" (${c.currentConviction}): ${c.conditions.slice(0, 2).map(s => sanitizeForPrompt(s, 60)).join("; ")}`)
          .join("\n");
        return `## 上次复核简报（对比参考）
改变判断的条件:
${prevConditions || "无"}

⚠️ 重要：如果改变判断的条件与上次完全相同，请明确写"条件未变，持续监控"。如果有新的观察或数据支持，请更新条件描述。避免逐字重复上次内容。`;
      })()
    : "";

  return `你是一个投资研究操作系统的「每日复核简报编辑」。请基于今日复核结果生成一份简报。

## 组合概况
总权益: $${ctx.portfolio.totalEquity.toFixed(0)}
现金占比: ${(ctx.portfolio.cashPct * 100).toFixed(1)}%
市场 Regime: ${ctx.market?.regime ?? "unknown"}
VIX: ${ctx.market?.vix ?? "N/A"}

## 今日复核成果
投资判断更新: ${ctx.thesesUpdated} 个
新记忆: ${ctx.memoriesCreated} 条

## 需要复核的变化
${surpriseText}

## 今日复核详情
### 工具调用
${toolsText}
${tracesText ? `### 复核结论\n${tracesText}` : ""}

## 当前活跃投资判断
${thesisText}
${prevBriefingText}

## 任务
生成两类输出（“自动跟踪清单”由系统代码直出，无需你生成）：
1. **需要复核的变化**：最不符合现有认知、或可能改变仓位假设的变化（从上面的 surprises 和工具调用结果中总结）。如果没有实质变化，**必须**返回空数组 \`[]\`，**不要**生成"市场与预期一致"等占位条目；系统会在输出为空时自动展示 fallback 文案。仅当 severityScore >= 3 的真实矛盾信息才值得输出。
2. **改变判断的条件**：当前高 conviction 投资判断需要什么条件才会改变看法。基于本次复核的具体数据给出条件，不要泛泛而谈。

## 长度规范（必须遵守，输出会直接推送到手机通知）
- surprises.title ≤ 20 字；surprises.description 是**一句完整的话**，≤ 80 字；suggestedAction ≤ 40 字
- mindChangeConditions.conditions 每条 ≤ 60 字且是完整句子，最多 3 条
- 不要靠堆砌细节凑长度；超长内容会被截断，宁可短而完整

## 输出格式（严格 JSON）
\`\`\`json
{
  "surprises": [
    { "title": "变化标题", "description": "描述", "relatedThesisId": null, "severityScore": 7, "suggestedAction": "建议" }
  ],
  "mindChangeConditions": [
    { "thesisTitle": "投资判断标题", "currentConviction": "high", "conditions": ["条件1"], "monitoringIndicators": ["VIX"] }
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

// ── 目标权重建议 Prompt（surfaceNode 末尾，生成目标权重计划） ──

function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

export function buildStrategyAdvisorPrompt(ctx: {
  holdings: Array<{
    assetKey: string;
    symbol: string;
    weightPct: number;
    lastPrice?: number;
    price?: number;
    unrealizedPnlPct?: number | null;
    holdingQty?: number;
    targetWeightHint?: number;
    gapPct?: number | null;
    valuationBase?: number | null;
  }>;
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
    const targetPct = h.targetWeightHint == null ? null : Math.max(0, h.targetWeightHint) * 100;
    const targetText = targetPct == null ? "" : ` 目标${targetPct.toFixed(1)}%`;
    const gapText = h.gapPct == null ? "" : ` 偏离${h.gapPct >= 0 ? "+" : ""}${h.gapPct.toFixed(1)}pct`;
    const valueText = h.valuationBase == null ? "" : ` 估值$${fmtK(h.valuationBase)}`;
    const pnlText = h.unrealizedPnlPct == null ? "" : ` 未实现盈亏${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}%`;
    const price = h.lastPrice ?? h.price ?? 0;
    return `${h.symbol} (${h.assetKey}) 当前${(h.weightPct * 100).toFixed(1)}%${targetText}${gapText}${valueText} 数量${Number(h.holdingQty ?? 0).toFixed(6)} 现价$${price.toFixed(2)}${pnlText}${thesis ? ` 投资判断="${sanitizeForPrompt(thesis.title, 40)}" conviction=${thesis.conviction}` : " 无投资判断"}`;
  }).join("\n");

  const thesisLines = ctx.theses.slice(0, 15).map(t =>
    `"${sanitizeForPrompt(t.title, 50)}" conviction=${t.conviction} 资产=${t.assetKeys.join(",")} 失效条件=${sanitizeForPrompt(t.invalidationConditions ?? "无", 60)}`
  ).join("\n");

  const watchlistLines = (ctx.watchlist ?? []).slice(0, 40).map(w => {
    const thesis = ctx.theses.find(t => t.assetKeys.includes(w.assetKey));
    const tags = w.tags.length > 0 ? ` tags=${w.tags.slice(0, 3).join("/")}` : "";
    const target = w.targetWeightPct > 0 ? ` 观察目标${w.targetWeightPct.toFixed(1)}%` : "";
    const note = w.notes ? ` notes="${sanitizeForPrompt(w.notes, 50)}"` : "";
    return `${w.symbol} (${w.assetKey}) 现价$${w.lastPrice.toFixed(2)}${target}${tags}${note}${thesis ? ` 投资判断="${sanitizeForPrompt(thesis.title, 40)}" conviction=${thesis.conviction}` : " 无投资判断"}`;
  }).join("\n") || "无";

  const surpriseLines = ctx.surprises.length > 0
    ? ctx.surprises.map(s => `[${s.severityScore}/10] ${sanitizeForPrompt(s.title, 60)}`).join("\n")
    : "无需要复核的变化";

  const gapLines = ctx.cognitionGaps.length > 0
    ? ctx.cognitionGaps.map(g => {
      const scope = g.portfolioWeight > 0 ? `权重${(g.portfolioWeight * 100).toFixed(1)}%` : "观察列表";
      return `${g.assetKey} ${scope}：${sanitizeForPrompt(g.uncertaintyReason || `相关判断上次复核 ${g.daysSinceLastInvestigation} 天前`, 90)}${g.suggestedInvestigation ? `；${sanitizeForPrompt(g.suggestedInvestigation, 90)}` : ""}`;
    }).join("\n")
    : "无";

  return `你是投资组合的「目标权重复核助手」。基于当前组合状况和投资判断分析，输出你对规则引擎参数的建议。

## 当前持仓
${holdingLines}

## 观察列表候选
${watchlistLines}

## 活跃投资判断
${thesisLines}

## 需要复核的变化
${surpriseLines}

## 自动跟踪项
${gapLines}

## 当前执行约束
- 市场 regime (规则判定): ${ctx.ruleRegime}
- 单资产目标权重硬上限: ${(ctx.maxPositionPct * 100).toFixed(0)}%

## 任务
根据你的分析输出 JSON 目标权重计划：

1. **regimeOverride**: 你是否同意规则引擎的 regime 判断？如果不同意且置信度 >= 80，给出你的判断。同意则设为 null。
2. **targetAllocationPlan**: 当前系统运行在全自动模式。只要存在可交易的观察列表候选、当前持仓或可部署现金，你都必须给出“最终目标权重”；执行层会把目标权重差额转成 BUY/SELL 订单并自动执行。只有完全没有可交易资产时才允许返回 null。

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
  "targetAllocationPlan": {"reasoning": "TSLA投资判断失效，主动降至观察仓；现金保留为防守缓冲", "intents": [{"symbol": "TSLA", "assetKey": "US::TSLA", "proposedTargetWeightPct": 3, "confidence": 86, "reasoning": "判断失效且波动放大"}]}
}
\`\`\`

规则:
- proposedTargetWeightPct 使用百分比口径，例如 3 表示 3%；自动执行时会被单仓上限截断
- 可以对观察列表候选给出新目标权重；这会生成 BUY 提案。可以对当前持仓给出更低目标权重甚至 0；这会生成 SELL 提案。
- 全自动模式下，优先从观察列表中选出 1-5 个最值得执行的资产并给出非 0 目标权重；不确定时也要给出小仓位试探目标，而不是只观察
- targetAllocationPlan.intents 只列需要改变目标权重的资产；每条 reasoning 必须解释“为什么从当前目标/当前权重调整到 proposedTargetWeightPct”，不要只写泛泛看好/看空
- 单资产目标权重超过 20%，或相对当前目标提高超过 10pct 时，reasoning 必须包含强依据、主要风险和仓位上限考虑；依据不足时只能给小仓位试探或维持原目标
- confidence 代表你的把握程度，但执行层默认会采纳；因此不能在信息不足时为了满足输出要求给出大仓位
- regimeOverride.confidence < 80 时不会被采纳
- 不要输出“继续观察”式空计划；你的任务是直接形成可执行目标权重
- targetAllocationPlan.reasoning ≤ 120 字、每条 intent.reasoning ≤ 60 字，且必须是完整句子（输出会直接推送到手机通知，超长会被截断）

只输出 JSON，不要其他文字。`;
}

// ── Reflect 节点 Prompt ──

export function buildReflectPrompt(ctx: {
  thread: ResearchThread;
  updatedThesis: string;
  newConviction: string;
  evidenceSummary: string;
}): string {
  return `你是一个投资研究操作系统的「首席风控官」。刚刚一个投资判断发生了变化，你需要反思。

## 投资判断变化
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
原判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
新判断: ${sanitizeForPrompt(ctx.updatedThesis, 200)}
原信念: ${ctx.thread.conviction} → 新信念: ${ctx.newConviction}

## 依据摘要
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
  return `你是一个投资研究操作系统的「复盘审计师」。以下投资判断已到复盘日期。

## 投资判断信息
标题: ${sanitizeForPrompt(ctx.thread.title, 80)}
当时判断: ${sanitizeForPrompt(ctx.thread.thesisText, 200)}
信念强度: ${ctx.thread.conviction}
创建时间: ${ctx.thread.createdAt}
${ctx.priceChangeText ? `\n## 实际市场表现${ctx.priceChangeText}` : ""}

## 当前市场
Regime: ${ctx.marketRegime}
VIX: ${ctx.vix ?? "N/A"}

## 任务
基于投资判断创建时的原始判断和实际市场表现，评估准确度并决定是否保留：
- accuracyScore: 0=完全错误，1=完全准确
- shouldInvalidate: 实际走势否定了原判断（如看多但跌 >15%、或核心逻辑被新事实推翻）→ true
- shouldArchive: 原判断已兑现/play out（如目标已达、催化剂已落地）→ true
- 两者都 false 时投资判断继续观察，会在下个周期再复盘

注意：shouldInvalidate 和 shouldArchive 互斥，最多一个为 true。

## 输出格式（严格 JSON）
\`\`\`json
{
  "actualOutcome": "实际发生了什么",
  "accuracyScore": 0.7,
  "lesson": "从这次复盘中学到的教训（如果有）",
  "shouldInvalidate": false,
  "shouldArchive": false
}
\`\`\`

## 示例输出

继续观察：
\`\`\`json
{
  "actualOutcome": "看多NVDA的判断基本正确，期间上涨18%，但波动超预期，中间有一次12%回撤",
  "accuracyScore": 0.7,
  "lesson": "高波动资产即使方向正确也需要设置止损，conviction=high不等于低风险",
  "shouldInvalidate": false,
  "shouldArchive": false
}
\`\`\`

判断被否定（失效）：
\`\`\`json
{
  "actualOutcome": "看多XX但期间下跌22%，原因是核心催化剂业绩miss，原判断已被市场否决",
  "accuracyScore": 0.1,
  "lesson": "看多需要更明确的盈利可见性，避免在催化剂未确认前重仓",
  "shouldInvalidate": true,
  "shouldArchive": false
}
\`\`\`

判断已兑现（归档）：
\`\`\`json
{
  "actualOutcome": "黄金避险判断完全兑现，期间GLD上涨14%，地缘风险催化剂已充分定价",
  "accuracyScore": 0.95,
  "lesson": "VIX > 25 同时金银比 > 80 是高确定性的金价上行信号",
  "shouldInvalidate": false,
  "shouldArchive": true
}
\`\`\`

只输出 JSON，不要其他文字。`;
}

// Telegram / Chat 复核简报渲染已移至 src/daa/agent/briefingPresenter.ts（展示层与 prompt 层分离）。
