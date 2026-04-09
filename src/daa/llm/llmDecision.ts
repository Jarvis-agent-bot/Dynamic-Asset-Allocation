/**
 * @deprecated 旧 AI-Assisted Pipeline 组件，将被 Cognitive Agent OS 替代。
 * 替代方案：src/daa/agent/cognitiveGraph.ts 的 investigateNode
 * 清理计划：等 Cognitive Agent 接管 rebalance 提案生成后删除
 *
 * llmDecision.ts
 *
 * LLM 决策分析 V2 —— LLM 从"旁观者"升级为"参与者"。
 *
 * 与 llmAnalysis.ts 的区别：
 * - V1：输出叙事文本（summary / opportunity_notes / risk_notes），不影响建议量
 * - V2：输出结构化 JSON，包含每个资产的调整系数（sizeMagnitude），
 *       直接参与 decisionFusion.ts 的决策融合计算
 *
 * 降级策略（Graceful Degradation）：
 * - LLM 未配置 / 超时 / 返回非 JSON → status="skipped"|"parse_fallback"|"error"
 * - 降级时 perAssetAdjustments 为空数组，融合层按纯 drift + signal 处理
 * - 整个再平衡流程不阻断
 */

import { callLlm, normalizeText, resolveLlmConfig, toFinite } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { CashClassification } from "@/src/daa/modules/workbench/cashClassification";
import type { DaaFusedOpportunity } from "@/src/daa/signals/fusion";
import type { DaaMarketContext } from "@/src/daa/modules/marketContext/marketContextTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

/** LLM 对单个资产的调整建议 */
export type LlmPerAssetAdjustment = {
  /** 资产代码（大写）*/
  symbol: string;
  /**
   * 调整指令：
   * - execute：按建议量全量执行
   * - reduce_size：缩减建议量（sizeMagnitude 生效）
   * - skip：跳过本资产，deselect
   * - increase_priority：信号一致，标记为高优先级
   */
  adjustment: "execute" | "reduce_size" | "skip" | "increase_priority";
  /**
   * 建议量倍数（0-1）：
   * 1.0 = 全量执行，0.5 = 半仓，0 = 等同 skip
   */
  sizeMagnitude: number;
  /** LLM 对此调整的置信度（0-100）*/
  confidencePct: number;
  /** 简短中文说明（120字以内，需引用具体数据）*/
  rationale: string;
  /** LLM 建议的四维信号权重（总和=100，可选） */
  suggestedWeights?: {
    human: number;
    technical: number;
    news: number;
    valuation: number;
  };
  /** V3: AI 对四维信号的解读（可选） */
  signalInterpretation?: string;
  /** V3: 该资产的具体风险点（可选） */
  riskFactors?: string[];
};

/** LLM 结构化决策输出 */
export type LlmDecisionOutput = {
  /** 执行状态 */
  status: "ok" | "skipped" | "parse_fallback" | "error";
  /** 当前市场环境判断 */
  marketRegime: "risk_on" | "risk_off" | "transitional";
  /** 整体置信度（0-100）*/
  overallConfidence: number;
  /** 每个资产的具体调整建议 */
  perAssetAdjustments: LlmPerAssetAdjustment[];
  /** 现金配置建议 */
  cashAdvice: "hold" | "deploy_to_underweight" | "await_signal";
  /** 现金建议说明 */
  cashRationale: string;
  /** 一句话总体判断 */
  summary: string;
  /** 关键风险（3-5条）*/
  keyRisks: string[];
  /** 关键机会（2-3条）*/
  keyOpportunities: string[];
  /** 整体推理说明（200字以内中文）*/
  reasoning?: string;
  /** LLM 提供商 */
  provider: string;
  /** 模型名称 */
  model: string;
  /** 响应延迟（ms）*/
  latencyMs: number;
  /** 生成时间 */
  generatedAt: string;
  /** 跳过/失败的原因码 */
  reasonCode?: string;
  /** V3: LLM 的整体市场叙事（可选） */
  marketNarrative?: string;
};

export type LlmDecisionInput = {
  baseCurrency: string;
  totalEquity: number;
  cashClassification: CashClassification;
  draftProposals: Array<{
    symbol: string;
    side: "BUY" | "SELL";
    /** 原始偏移比例（小数，如 0.05 = 5%）*/
    driftPct: number;
    suggestedNotional: number;
  }>;
  fusedOpportunities: DaaFusedOpportunity[];
  warnings: string[];
  analysisFocus: string;
  marketContext?: DaaMarketContext | null;
  recentLearningsText?: string | null;
  /** 持仓约束上下文，让 LLM 感知仓位集中度限制 */
  positionConstraints?: {
    maxPositionPct: number;
    currentWeights: Array<{
      symbol: string;
      currentWeightPct: number;
      headroomPct: number;
    }>;
    hhiPct: number;
  } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatPositionConstraints(constraints: LlmDecisionInput["positionConstraints"]): string {
  if (!constraints || !constraints.currentWeights.length) return "暂无持仓约束数据";
  const lines: string[] = [];
  lines.push(`单一仓位上限: ${(constraints.maxPositionPct * 100).toFixed(0)}%`);
  lines.push(`当前集中度 HHI: ${constraints.hhiPct.toFixed(1)}`);
  lines.push("各资产仓位:");
  for (const w of constraints.currentWeights) {
    const headroom = w.headroomPct.toFixed(1);
    const warn = w.headroomPct < 3 ? " ⚠️接近上限" : "";
    lines.push(`  ${w.symbol}: 当前 ${w.currentWeightPct.toFixed(1)}%, 距上限余量 ${headroom}%${warn}`);
  }
  return lines.join("\n");
}

import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

function formatMarketContextForPrompt(marketContext: DaaMarketContext | null | undefined): string {
  if (!marketContext) return "市场状态层未启用或暂无可用快照";
  const reasons = marketContext.reasons.slice(0, 5).join("; ") || "无";
  // 展示全部指标（不再 slice(0,4)），包含趋势和 Z-score
  const indicators = marketContext.indicators.map((item) => {
    const parts = [
      `${item.label}:值=${item.rawValue == null ? "N/A" : item.rawValue}${item.unit || ""}`,
      `分位=${item.percentile252 == null ? "N/A" : item.percentile252.toFixed(0)}%`,
    ];
    if (item.zscore60 != null) parts.push(`z=${item.zscore60.toFixed(1)}`);
    if (item.trend7dPct != null) parts.push(`7d=${item.trend7dPct > 0 ? "+" : ""}${item.trend7dPct.toFixed(1)}%`);
    if (item.trend30dPct != null) parts.push(`30d=${item.trend30dPct > 0 ? "+" : ""}${item.trend30dPct.toFixed(1)}%`);
    parts.push(item.reason);
    return parts.join(",");
  }).join(" | ");
  const scopes = marketContext.scopes.length > 0
    ? `, scopes=[${marketContext.scopes.map((s) => `${s.label}:${s.regime}(buyScale=${s.buyScale})`).join(", ")}]`
    : "";
  return `riskOffScore=${marketContext.riskOffScorePct.toFixed(1)}, regime=${marketContext.regime}, buyScale=${marketContext.buyScale.toFixed(2)}, highRiskBuyScale=${marketContext.highRiskBuyScale.toFixed(2)}, reasons=${reasons}, indicators=[${indicators}]${scopes}`;
}

/**
 * 格式化单个资产的四维信号详情，供 LLM 做出更精准的决策。
 * 替代之前只传 "综合评分68, 置信度72, 原因=[...]" 的简略模式。
 */
function formatSignalDetailsForPrompt(o: DaaFusedOpportunity): string {
  const lines: string[] = [`### ${o.symbol} (综合${o.finalScorePct.toFixed(0)}分, ${o.action})`];

  // 人因信号
  if (o.human) {
    const h = o.human;
    lines.push(`  人因: 评分${h.aggregatedScorePct.toFixed(0)}, 置信${h.confidencePct.toFixed(0)}%, 趋势${h.momentumRegime}, 立场${h.stance}, ${h.evidenceCount}个基金`);
  } else {
    lines.push(`  人因: 无数据`);
  }

  // 技术信号
  if (o.technical) {
    const t = o.technical;
    const rsi = t.metrics.rsi14;
    const macdDir = t.metrics.macdHist > 0 ? "偏多" : t.metrics.macdHist < 0 ? "偏空" : "中性";
    lines.push(`  技术: 评分${t.scorePct.toFixed(0)}, 动量${t.momentumRegime}, RSI ${rsi.toFixed(0)}, MACD${macdDir}, 20日收益${t.metrics.return20Pct.toFixed(1)}%, 回撤${t.metrics.drawdown30Pct.toFixed(1)}%`);
  } else {
    lines.push(`  技术: 无数据`);
  }

  // 新闻信号
  if (o.news) {
    const n = o.news;
    lines.push(`  新闻: 评分${n.scorePct.toFixed(0)}, ${n.evidenceCount}条`);
    // 使用 LLM 新闻摘要（v2 新增）
    const llmSummary = (n as Record<string, unknown>).llmSummary as string | undefined;
    if (llmSummary) {
      lines.push(`    摘要: ${sanitizeForPrompt(llmSummary, 80)}`);
    }
    const llmDrivers = (n as Record<string, unknown>).llmDrivers as { bullish?: string[]; bearish?: string[] } | undefined;
    if (llmDrivers) {
      if (llmDrivers.bullish?.length) lines.push(`    利好: ${llmDrivers.bullish.slice(0, 2).map((d) => sanitizeForPrompt(d, 30)).join(" | ")}`);
      if (llmDrivers.bearish?.length) lines.push(`    利空: ${llmDrivers.bearish.slice(0, 2).map((d) => sanitizeForPrompt(d, 30)).join(" | ")}`);
    }
  } else {
    lines.push(`  新闻: 无数据`);
  }

  // 估值信号
  if (o.valuation) {
    const v = o.valuation;
    lines.push(`  估值: 评分${v.scorePct.toFixed(0)}, 温度${v.temperature}, 90天百分位${v.metrics.percentile90.toFixed(0)}%, z-score${v.metrics.zscore60.toFixed(1)}`);
  } else {
    lines.push(`  估值: 无数据`);
  }

  return lines.join("\n");
}

/** 分析师自主决策模式 — LLM 基于目标和约束自主推理 */
function buildDecisionPrompt(input: LlmDecisionInput): string {
  const { baseCurrency, totalEquity, cashClassification: cc } = input;

  const proposalLines = input.draftProposals.length > 0
    ? input.draftProposals.slice(0, 16).map((p) =>
        `  - ${p.symbol}: ${p.side}, 偏移${(p.driftPct * 100).toFixed(2)}%, 建议规模 ${p.suggestedNotional.toFixed(0)} ${baseCurrency}`,
      ).join("\n")
    : "  (无漂移建议，组合接近目标)";

  const proposalSymbolSet = new Set(input.draftProposals.map((p) => p.symbol.toUpperCase()));
  const oppMap = new Map(input.fusedOpportunities.map((o) => [o.symbol.toUpperCase(), o]));
  const primaryOpps = input.draftProposals
    .map((p) => oppMap.get(p.symbol.toUpperCase()))
    .filter((o): o is DaaFusedOpportunity => o != null);
  const secondaryOpps = input.fusedOpportunities
    .filter((o) => !proposalSymbolSet.has(o.symbol.toUpperCase()))
    .slice(0, 4);
  const signalParts: string[] = [];
  if (primaryOpps.length > 0) {
    signalParts.push(primaryOpps.map((o) => formatSignalDetailsForPrompt(o)).join("\n\n"));
  }
  if (secondaryOpps.length > 0) {
    signalParts.push("--- 其他观察资产（精简） ---");
    signalParts.push(secondaryOpps.map((o) =>
      `  ${o.symbol}: 综合${o.finalScorePct.toFixed(0)}分, ${o.action}, 置信${o.confidencePct.toFixed(0)}%`,
    ).join("\n"));
  }
  const signalDetails = signalParts.length > 0 ? signalParts.join("\n\n") : "(暂无可用信号)";

  const cashLines = [
    `总现金: ${cc.totalCash.toFixed(0)} ${baseCurrency}`,
    `运营储备: ${cc.operationalReserve.toFixed(0)} (${(cc.operationalReservePct * 100).toFixed(1)}%)`,
    `策略性现金(货基): ${cc.strategicCash.toFixed(0)} (偏移${(cc.strategicCashDriftPct * 100).toFixed(2)}%)`,
    `可投闲置: ${cc.investableIdle.toFixed(0)} (${(cc.investableIdlePct * 100).toFixed(1)}%, 已${cc.cashIdleDays}天)`,
    `近期入金冷静期: ${cc.recentDepositCooldownActive ? "是" : "否"}`,
  ].join("\n  ");

  const warningText = input.warnings.slice(0, 5).join("; ") || "无";
  const marketContextText = formatMarketContextForPrompt(input.marketContext);
  const learningsText = normalizeText(input.recentLearningsText, "暂无可复用的历史复盘经验。");

  return `你是 DAA 组合分析师。你的任务是基于四维信号（人因/技术/新闻/估值）和市场环境，
独立分析每个资产的投资价值，给出调整建议和推理依据。你有完整的决策自主权。

## 你的目标
1. 最大化组合的风险调整后收益
2. 控制单资产和组合整体的下行风险
3. 避免过度交易（除非信号明确且置信度高）
4. 在不确定时偏保守 — 宁可少赚不可多亏

## 基本信息
- 基准货币: ${baseCurrency}
- 组合总权益: ${totalEquity.toFixed(0)} ${baseCurrency}
- 分析重点: ${sanitizeForPrompt(input.analysisFocus, 120)}

## 当前市场环境
${marketContextText}

## 历史复盘与决策表现
${learningsText}

## 纯数学漂移建议（等待你的分析修正）
${proposalLines}

## 各资产四维信号详情
${signalDetails}

## 现金状态
  ${cashLines}

## 持仓约束
${formatPositionConstraints(input.positionConstraints)}

## 系统风险告警
${warningText}

## 约束（不可违反）
- 仓位上限: 每个资产不可超过上方标注的最大仓位百分比
- 如果某资产距仓位上限余量 < 3%，必须大幅缩减或跳过
- 入金冷静期为"是"时，cashAdvice 必须是 "hold" 或 "await_signal"
- perAssetAdjustments 只包含漂移建议中出现的资产
- rationale 必须引用具体数据（RSI 值、价格变化百分比、基金经理动向等）

## 分析指引（非强制，供参考）
- 多数信号看空但漂移要求买入时 → 谨慎缩减
- 信号与漂移方向一致 + 高置信度 → 可全量或优先执行
- 市场防守期（risk_off）→ 买入操作整体偏保守
- 缺乏信号数据的资产 → 可按漂移执行但规模适度保守
- 权重分配参考: 财报季提高新闻权重，强趋势提高技术权重，基金经理密集操作提高人因权重

## 输出 JSON 结构（严格遵守，不要包含其他文字）：
{
  "marketRegime": "risk_on 或 risk_off 或 transitional",
  "marketNarrative": "50字以内，你对当前市场的整体判断",
  "overallConfidence": 0到100,
  "perAssetAdjustments": [
    {
      "symbol": "资产代码（大写）",
      "suggestedWeights": { "human": 0到100, "technical": 0到100, "news": 0到100, "valuation": 0到100 },
      "adjustment": "execute 或 reduce_size 或 skip 或 increase_priority",
      "sizeMagnitude": 0到1,
      "confidencePct": 0到100,
      "rationale": "中文说明，120字以内，引用具体数据",
      "signalInterpretation": "你如何解读这个资产的四维信号，80字以内",
      "riskFactors": ["该资产的主要风险点1", "风险点2"]
    }
  ],
  "cashAdvice": "hold 或 deploy_to_underweight 或 await_signal",
  "cashRationale": "20字以内",
  "summary": "一句话总体判断，50字以内",
  "keyRisks": ["风险点1", "风险点2"],
  "keyOpportunities": ["机会1", "机会2"],
  "reasoning": "200字以内，阐述本次决策的核心逻辑、你如何权衡各信号、你的主要顾虑"
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parser
// ─────────────────────────────────────────────────────────────────────────────

function extractJsonText(rawText: string): string | null {
  const trimmed = rawText.trim();

  // 尝试直接解析
  if (trimmed.startsWith("{")) return trimmed;

  // 从 markdown 代码块提取
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch?.[1]) return mdMatch[1].trim();

  // 提取第一个完整 { ... }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);

  return null;
}

function parsePerAssetAdjustments(raw: unknown): LlmPerAssetAdjustment[] {
  if (!Array.isArray(raw)) return [];
  const VALID_ADJUSTMENTS = new Set(["execute", "reduce_size", "skip", "increase_priority"]);

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item): LlmPerAssetAdjustment | null => {
      const symbol = normalizeText(item.symbol).toUpperCase();
      if (!symbol) return null;
      const adjustment = VALID_ADJUSTMENTS.has(String(item.adjustment || ""))
        ? (item.adjustment as LlmPerAssetAdjustment["adjustment"])
        : "execute";
      // 解析 LLM 建议的四维权重（可选字段）
      const rawWeights = item.suggestedWeights as Record<string, unknown> | undefined;
      const suggestedWeights = rawWeights && typeof rawWeights === "object"
        ? {
            human: Math.max(0, Math.min(100, toFinite(rawWeights.human, 30))),
            technical: Math.max(0, Math.min(100, toFinite(rawWeights.technical, 25))),
            news: Math.max(0, Math.min(100, toFinite(rawWeights.news, 25))),
            valuation: Math.max(0, Math.min(100, toFinite(rawWeights.valuation, 20))),
          }
        : undefined;

      return {
        symbol,
        adjustment,
        sizeMagnitude: Math.max(0, Math.min(1, toFinite(item.sizeMagnitude, 1.0))),
        confidencePct: Math.max(0, Math.min(100, toFinite(item.confidencePct, 50))),
        rationale: normalizeText(item.rationale).slice(0, 120),
        suggestedWeights,
        // V3 optional fields
        signalInterpretation: item.signalInterpretation ? normalizeText(item.signalInterpretation).slice(0, 120) : undefined,
        riskFactors: Array.isArray(item.riskFactors)
          ? item.riskFactors.map((r: unknown) => normalizeText(r)).filter(Boolean).slice(0, 5)
          : undefined,
      };
    })
    .filter((item): item is LlmPerAssetAdjustment => item !== null);
}

function parseLlmJsonOutput(jsonText: string): Omit<LlmDecisionOutput, "status" | "provider" | "model" | "latencyMs" | "generatedAt" | "reasonCode"> | null {
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return null;
    obj = parsed as Record<string, unknown>;
  } catch (err) {
    logSwallowed("llmDecision.parseLlmJsonOutput", err);
    return null;
  }

  const VALID_REGIMES = new Set(["risk_on", "risk_off", "transitional"]);
  const marketRegime = VALID_REGIMES.has(String(obj.marketRegime || ""))
    ? (obj.marketRegime as LlmDecisionOutput["marketRegime"])
    : "transitional";

  const VALID_CASH_ADVICE = new Set(["hold", "deploy_to_underweight", "await_signal"]);
  const cashAdvice = VALID_CASH_ADVICE.has(String(obj.cashAdvice || ""))
    ? (obj.cashAdvice as LlmDecisionOutput["cashAdvice"])
    : "hold";

  return {
    marketRegime,
    overallConfidence: Math.max(0, Math.min(100, toFinite(obj.overallConfidence, 50))),
    perAssetAdjustments: parsePerAssetAdjustments(obj.perAssetAdjustments),
    cashAdvice,
    cashRationale: normalizeText(obj.cashRationale).slice(0, 80),
    summary: normalizeText(obj.summary).slice(0, 200),
    keyRisks: Array.isArray(obj.keyRisks)
      ? obj.keyRisks.map((r) => normalizeText(r)).filter(Boolean).slice(0, 5)
      : [],
    keyOpportunities: Array.isArray(obj.keyOpportunities)
      ? obj.keyOpportunities.map((o) => normalizeText(o)).filter(Boolean).slice(0, 3)
      : [],
    reasoning: normalizeText(obj.reasoning).slice(0, 200) || undefined,
    marketNarrative: obj.marketNarrative ? normalizeText(obj.marketNarrative).slice(0, 100) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildSkippedOutput(
  reason: string,
  reasonCode: string,
  provider: string,
  model: string,
  startedAt: number,
): LlmDecisionOutput {
  return {
    status: "skipped",
    marketRegime: "transitional",
    overallConfidence: 50,
    perAssetAdjustments: [],
    cashAdvice: "hold",
    cashRationale: "",
    summary: reason,
    keyRisks: [],
    keyOpportunities: [],
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
    reasonCode,
  };
}

function buildErrorOutput(
  summary: string,
  reasonCode: string,
  provider: string,
  model: string,
  startedAt: number,
): LlmDecisionOutput {
  return {
    status: "error",
    marketRegime: "transitional",
    overallConfidence: 50,
    perAssetAdjustments: [],
    cashAdvice: "hold",
    cashRationale: "",
    summary,
    keyRisks: [],
    keyOpportunities: [],
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    generatedAt: new Date().toISOString(),
    reasonCode,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 运行 LLM 结构化决策分析（V2）。
 *
 * 任何失败都会优雅降级，返回 status != "ok" 的结果，
 * 融合层会将其视为"无 LLM 参与"，继续 drift + signal 路径。
 */
export async function runLlmDecision(input: LlmDecisionInput): Promise<LlmDecisionOutput> {
  const startedAt = Date.now();
  const config = await resolveLlmConfig();

  // ── 配置检查 ───────────────────────────────────────────────────
  if (!config.enabled) {
    return buildSkippedOutput("LLM 决策分析未启用", "llm_disabled", config.provider, config.model, startedAt);
  }
  if (!config.enabledInDecision) {
    return buildSkippedOutput("LLM 在决策链路中未启用", "llm_disabled_in_decision", config.provider, config.model, startedAt);
  }
  if (!config.endpoint) {
    return buildSkippedOutput("LLM 缺少 endpoint 配置", "missing_endpoint", config.provider, config.model, startedAt);
  }
  if (!config.apiKey) {
    return buildSkippedOutput("LLM 缺少 API Key", "missing_api_key", config.provider, config.model, startedAt);
  }

  // ── 调用 LLM ──────────────────────────────────────────────────
  try {
    const prompt = buildDecisionPrompt(input);
    const llmResult = await callLlm(config, prompt);
    const rawText = llmResult.text;

    // 尝试解析 JSON
    const jsonText = extractJsonText(rawText);
    if (!jsonText) {
      return {
        status: "parse_fallback",
        marketRegime: "transitional",
        overallConfidence: 50,
        perAssetAdjustments: [],
        cashAdvice: "hold",
        cashRationale: "LLM 返回内容无法提取 JSON",
        summary: rawText.slice(0, 120) || "LLM 响应格式异常",
        keyRisks: [],
        keyOpportunities: [],
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
        reasonCode: "parse_failed",
      };
    }

    const parsed = parseLlmJsonOutput(jsonText);
    if (!parsed) {
      return {
        status: "parse_fallback",
        marketRegime: "transitional",
        overallConfidence: 50,
        perAssetAdjustments: [],
        cashAdvice: "hold",
        cashRationale: "LLM JSON 解析失败",
        summary: "LLM 返回 JSON 结构异常，已跳过 AI 调整",
        keyRisks: [],
        keyOpportunities: [],
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
        reasonCode: "parse_failed",
      };
    }

    return {
      status: "ok",
      ...parsed,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - startedAt,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return buildErrorOutput(
      `LLM 决策分析失败: ${msg.slice(0, 80)}`,
      isTimeout ? "timeout" : "network_or_api_error",
      config.provider,
      config.model,
      startedAt,
    );
  }
}
