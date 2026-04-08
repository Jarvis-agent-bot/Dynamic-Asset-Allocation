/**
 * llmPlanner.ts — Phase 2 规划器。
 *
 * 在信号采集前调用 LLM（便宜模型），让 AI 决定：
 * - 哪些资产需要深入分析
 * - 每个资产需要哪些信号（技术/估值/新闻/人因）
 * - 建议的信号权重
 * - 分析重点
 *
 * 降级：LLM 调用失败时返回全量采集计划。
 */

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  AGENT_TOOL_DEFINITIONS,
  formatToolDefinitionsForPrompt,
  type AgentToolDefinition,
  type SignalType,
  SIGNAL_TYPES,
} from "./agentToolRegistry";

// ─── Types ──────────────────────────────────────────────────────

export type PlannerInput = {
  baseCurrency: string;
  totalEquity: number;
  draftProposals: Array<{
    symbol: string;
    side: "BUY" | "SELL";
    driftPct: number;
    suggestedNotional: number;
  }>;
  marketRegime: string;
  marketRiskOffScore: number;
  holdingCount: number;
  recentLearningsText: string;
  availableTools?: AgentToolDefinition[];
};

export type PlannerAnalysisTarget = {
  symbol: string;
  requiredSignals: SignalType[];
  suggestedWeights?: { human: number; technical: number; news: number; valuation: number };
  focusNote: string;
};

export type PlannerOutput = {
  status: "ok" | "fallback";
  analysisTargets: PlannerAnalysisTarget[];
  skipDetailSymbols: string[];
  strategyNote: string;
  latencyMs: number;
};

// ─── Prompt ─────────────────────────────────────────────────────

function buildPlannerPrompt(input: PlannerInput): string {
  const tools = input.availableTools ?? AGENT_TOOL_DEFINITIONS;
  const toolsText = formatToolDefinitionsForPrompt(tools);

  const proposalLines = input.draftProposals.map((p) =>
    `  - ${p.symbol}: ${p.side}, 偏移${(p.driftPct * 100).toFixed(2)}%, 规模 ${p.suggestedNotional.toFixed(0)} ${input.baseCurrency}`,
  ).join("\n");

  return `你是 DAA 投资分析规划器。你的任务是为下一步的深入分析制定计划。

## 背景
- 组合总权益: ${input.totalEquity.toFixed(0)} ${input.baseCurrency}
- 当前持仓数: ${input.holdingCount}
- 市场环境: ${input.marketRegime}, 风险评分 ${input.marketRiskOffScore.toFixed(0)}

## 漂移建议（需要你决定如何分析）
${proposalLines}

## 可用的分析工具
${toolsText}

## 最近复盘经验
${input.recentLearningsText}

## 你的任务
为每个漂移建议的资产制定分析计划。你需要决定：
1. 哪些资产需要深入的多维度信号分析
2. 每个资产需要哪些信号（不必全部采集 — 节省时间和成本）
3. 每个资产的信号权重建议（总和=100）
4. 哪些资产可以直接按漂移执行（不需要深入分析）

## 决策指引
- 偏移很小（<1%）或金额很小的资产：可以跳过深入分析
- 市场 risk_off 时：重点关注技术信号和新闻
- 大额 BUY 建议：至少需要 technical + news
- SELL 建议：如果是小额减仓，可以只看 technical
- 有基金经理持仓数据的资产：值得看 human 信号
- 最近有重大新闻的资产：优先采集 news 信号

## 输出 JSON（严格格式，不要包含其他文字）
{
  "analysisTargets": [
    {
      "symbol": "资产代码",
      "requiredSignals": ["technical", "news"],
      "suggestedWeights": { "human": 20, "technical": 35, "news": 30, "valuation": 15 },
      "focusNote": "20字以内，分析重点说明"
    }
  ],
  "skipDetailSymbols": ["小额资产1", "小额资产2"],
  "strategyNote": "50字以内，整体分析策略说明"
}`;
}

// ─── Parser ─────────────────────────────────────────────────────

function parsePlannerResponse(text: string, allSymbols: string[]): PlannerOutput | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const analysisTargets: PlannerAnalysisTarget[] = [];
    if (Array.isArray(parsed.analysisTargets)) {
      for (const item of parsed.analysisTargets) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const symbol = String(rec.symbol || "").trim().toUpperCase();
        if (!symbol) continue;

        const rawSignals = Array.isArray(rec.requiredSignals)
          ? rec.requiredSignals.filter((s): s is SignalType => SIGNAL_TYPES.includes(s as SignalType))
          : [...SIGNAL_TYPES]; // 未指定则全部

        const rawWeights = rec.suggestedWeights as Record<string, unknown> | undefined;
        const suggestedWeights = rawWeights && typeof rawWeights === "object"
          ? {
              human: Math.max(0, Math.min(100, Number(rawWeights.human) || 25)),
              technical: Math.max(0, Math.min(100, Number(rawWeights.technical) || 25)),
              news: Math.max(0, Math.min(100, Number(rawWeights.news) || 25)),
              valuation: Math.max(0, Math.min(100, Number(rawWeights.valuation) || 25)),
            }
          : undefined;

        analysisTargets.push({
          symbol,
          requiredSignals: rawSignals.length > 0 ? rawSignals : [...SIGNAL_TYPES],
          suggestedWeights,
          focusNote: String(rec.focusNote || "").slice(0, 60),
        });
      }
    }

    const skipDetailSymbols = Array.isArray(parsed.skipDetailSymbols)
      ? parsed.skipDetailSymbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];

    // 确保所有 draftProposal 的 symbol 都被覆盖
    const coveredSymbols = new Set([
      ...analysisTargets.map((t) => t.symbol),
      ...skipDetailSymbols,
    ]);
    for (const sym of allSymbols) {
      if (!coveredSymbols.has(sym)) {
        // 未覆盖的 symbol 默认全量分析
        analysisTargets.push({
          symbol: sym,
          requiredSignals: [...SIGNAL_TYPES],
          focusNote: "规划器未覆盖，默认全量",
        });
      }
    }

    return {
      status: "ok",
      analysisTargets,
      skipDetailSymbols,
      strategyNote: String(parsed.strategyNote || "").slice(0, 100),
      latencyMs: 0,
    };
  } catch (e) {
    logSwallowed("llmPlanner.parse", e);
    return null;
  }
}

// ─── Fallback ───────────────────────────────────────────────────

function buildFallbackPlan(symbols: string[]): PlannerOutput {
  return {
    status: "fallback",
    analysisTargets: symbols.map((symbol) => ({
      symbol,
      requiredSignals: [...SIGNAL_TYPES] as SignalType[],
      focusNote: "降级：全量采集",
    })),
    skipDetailSymbols: [],
    strategyNote: "规划器降级，全量采集所有信号",
    latencyMs: 0,
  };
}

// ─── Main Entry ─────────────────────────────────────────────────

export async function runLlmPlanning(input: PlannerInput): Promise<PlannerOutput> {
  const startedAt = Date.now();
  const allSymbols = input.draftProposals.map((p) => p.symbol.toUpperCase());

  if (allSymbols.length === 0) {
    return { status: "ok", analysisTargets: [], skipDetailSymbols: [], strategyNote: "无漂移建议", latencyMs: 0 };
  }

  try {
    const config = await resolveLlmConfig();
    if (!config.enabled || !config.apiKey) {
      return buildFallbackPlan(allSymbols);
    }

    const prompt = buildPlannerPrompt(input);
    // 使用规划器模型（便宜/快速），通过 modelOverride
    const plannerModel = config.plannerModel || config.model;
    const result = await callLlm(config, prompt, { modelOverride: plannerModel });

    const parsed = parsePlannerResponse(result.text, allSymbols);
    if (!parsed) {
      return { ...buildFallbackPlan(allSymbols), latencyMs: Date.now() - startedAt };
    }

    return { ...parsed, latencyMs: Date.now() - startedAt };
  } catch (e) {
    logSwallowed("llmPlanner.run", e);
    return { ...buildFallbackPlan(allSymbols), latencyMs: Date.now() - startedAt };
  }
}
