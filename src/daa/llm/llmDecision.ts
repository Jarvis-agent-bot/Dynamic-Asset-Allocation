/**
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
  /** 简短中文说明（60字以内，需引用具体数据）*/
  rationale: string;
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0-1: 清理用户/信号输入后再注入 LLM prompt，防止 prompt injection。
 * 移除反引号、方括号、换行，限制最大长度。
 */
function sanitizeForPrompt(value: string, maxLen = 100): string {
  return value
    .replace(/[`\[\]\n\r]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

function formatMarketContextForPrompt(marketContext: DaaMarketContext | null | undefined): string {
  if (!marketContext) return "市场状态层未启用或暂无可用快照";
  const reasons = marketContext.reasons.slice(0, 3).join("; ") || "无";
  const indicators = marketContext.indicators.slice(0, 4).map((item) => (
    `${item.label}:值=${item.rawValue == null ? "N/A" : item.rawValue}${item.unit || ""},分位=${item.percentile252 == null ? "N/A" : item.percentile252.toFixed(1)}%,说明=${item.reason}`
  )).join(" | ");
  return `riskOffScore=${marketContext.riskOffScorePct.toFixed(1)}, regime=${marketContext.regime}, buyScale=${marketContext.buyScale.toFixed(2)}, highRiskBuyScale=${marketContext.highRiskBuyScale.toFixed(2)}, reasons=${reasons}, indicators=${indicators}`;
}

function buildDecisionPrompt(input: LlmDecisionInput): string {
  const { baseCurrency, totalEquity, cashClassification: cc } = input;

  const proposalLines = input.draftProposals.length > 0
    ? input.draftProposals.slice(0, 12).map((p) =>
        `  - ${p.symbol}: ${p.side}, 偏移${(p.driftPct * 100).toFixed(2)}%, 建议规模 ${p.suggestedNotional.toFixed(0)} ${baseCurrency}`,
      ).join("\n")
    : "  (无漂移建议，组合接近目标)";

  const signalLines = input.fusedOpportunities.length > 0
    ? input.fusedOpportunities.slice(0, 10).map((o) => {
        const safeReasons = o.reasons.slice(0, 2)
          .map((r) => sanitizeForPrompt(r, 40))
          .join("; ");
        return `  - ${o.symbol}: 综合评分${o.finalScorePct.toFixed(1)}, 置信度${o.confidencePct.toFixed(1)}, 行动=${o.action}, 原因=[${safeReasons}]`;
      }).join("\n")
    : "  (暂无可用信号)";

  const cashLines = [
    `总现金: ${cc.totalCash.toFixed(0)} ${baseCurrency}`,
    `运营储备: ${cc.operationalReserve.toFixed(0)} (${(cc.operationalReservePct * 100).toFixed(1)}%)`,
    `策略性现金(货基): ${cc.strategicCash.toFixed(0)} (偏移${(cc.strategicCashDriftPct * 100).toFixed(2)}%)`,
    `可投闲置: ${cc.investableIdle.toFixed(0)} (${(cc.investableIdlePct * 100).toFixed(1)}%, 已${cc.cashIdleDays}天)`,
    `近期入金冷静期: ${cc.recentDepositCooldownActive ? "是（请勿催促配置）" : "否"}`,
  ].join("\n  ");

  const warningText = input.warnings.slice(0, 5).join("; ") || "无";
  const marketContextText = formatMarketContextForPrompt(input.marketContext);
  const learningsText = normalizeText(input.recentLearningsText, "暂无可复用的历史复盘经验。");

  return `你是 DAA 量化投资决策助手，负责在再平衡流程中提供结构化决策参考。
请严格基于以下数据输出 JSON 格式的调整建议。不要给下单指令，只给调整系数和简短原因。

## 基本信息
- 基准货币: ${baseCurrency}
- 组合总权益: ${totalEquity.toFixed(0)} ${baseCurrency}
- 分析重点: ${sanitizeForPrompt(input.analysisFocus, 120)}

## 当前市场环境
${marketContextText}

## 最近复盘经验
${learningsText}

## 纯数学漂移建议（等待你的信号修正）
${proposalLines}

## 四路信号融合结果（人因35%/新闻20%/技术25%/估值20%）
${signalLines}

## 现金状态
  ${cashLines}

## 系统风险告警
${warningText}

## 请严格按以下 JSON 结构输出（不要包含任何其他文字）：
{
  "marketRegime": "risk_on 或 risk_off 或 transitional",
  "overallConfidence": 0到100,
  "perAssetAdjustments": [
    {
      "symbol": "资产代码（大写）",
      "adjustment": "execute 或 reduce_size 或 skip 或 increase_priority",
      "sizeMagnitude": 0到1（1.0=全量, 0.5=半仓, 0=等同skip）, 
      "confidencePct": 0到100,
      "rationale": "中文说明，60字以内，需引用具体数据（如指标值、偏移百分比）"
    }
  ],
  "cashAdvice": "hold 或 deploy_to_underweight 或 await_signal",
  "cashRationale": "现金建议说明，20字以内",
  "summary": "一句话总体市场判断，50字以内",
  "keyRisks": ["风险点1", "风险点2"],
  "keyOpportunities": ["机会1", "机会2"]
}

## 决策规则（必须遵守）：
1. 信号 action=reduce_or_avoid + 漂移方向=BUY → adjustment="reduce_size", sizeMagnitude<=0.5
2. 信号 action=open_or_add + 漂移方向=BUY, 且 confidencePct>=65 → adjustment="increase_priority"
3. 信号与漂移一致 → adjustment="execute", sizeMagnitude=1.0
4. 无信号数据的资产（不在信号列表中）→ adjustment="execute", sizeMagnitude=1.0（以漂移为准，不降权）
5. 如果近期入金冷静期为"是" → cashAdvice 必须是 "hold" 或 "await_signal"，禁止 "deploy_to_underweight"
6. cashAdvice="deploy_to_underweight" 仅在闲置超过7天 + 闲置比例>10% + 存在明确低配资产时才建议
7. marketRegime="risk_off" 时，所有 BUY 方向的 sizeMagnitude 不超过 0.7
8. perAssetAdjustments 只包含漂移建议中出现的资产，不要凭空添加其他资产`;
}

// ──────────────────────────────────────────────────────────────
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
      return {
        symbol,
        adjustment,
        sizeMagnitude: Math.max(0, Math.min(1, toFinite(item.sizeMagnitude, 1.0))),
        confidencePct: Math.max(0, Math.min(100, toFinite(item.confidencePct, 50))),
        rationale: normalizeText(item.rationale).slice(0, 60),
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
