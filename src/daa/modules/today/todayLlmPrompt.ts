/**
 * todayLlmPrompt.ts
 *
 * LLM prompt 模板与结构化输出解析。
 * LLM 只负责三件事：归纳分歧、行动建议、指出缺失。
 */

import { resolveLlmConfig, callLlm } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { TodayDecisionContext, TodayLlmOutput } from "./todayTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt template
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(ctx: TodayDecisionContext): string {
  const seatsText = ctx.signalSeats
    .map((s) => `- ${s.seat}: ${s.stance} (置信度 ${s.confidence}%) — ${s.keyFactor}`)
    .join("\n");

  const positionsText = ctx.portfolioState.positions
    .slice(0, 10)
    .map((p) => `  ${p.symbol}: 权重${p.weight.toFixed(1)}%, 漂移${p.drift > 0 ? "+" : ""}${p.drift.toFixed(1)}%`)
    .join("\n");

  const decisionsText = ctx.recentDecisions.length > 0
    ? ctx.recentDecisions
        .slice(0, 5)
        .map((d) => `  ${d.assetKey}: ${d.action} (${d.daysAgo}天前)${d.outcome ? ` 后验: ${d.outcome}` : ""}`)
        .join("\n")
    : "  无近期决策记录";

  return `你是一个私人投资委员会秘书。你的职责是归纳四个信号席位的结论，给出行动建议，并指出缺失信息。

## 当前决策上下文

### 组合状态
- 总权益: ${ctx.portfolioState.totalEquity.toFixed(0)}
- 现金比例: ${(ctx.portfolioState.cashRatio * 100).toFixed(1)}%
- 可用现金: ${ctx.portfolioState.availableCash.toFixed(0)}
- 持仓数量: ${ctx.portfolioState.positions.length}

### 持仓明细（前10）
${positionsText}

### 四席位结论
${seatsText}

### 风险约束
- 最大单一持仓权重: ${ctx.riskConstraints.maxSinglePosition.toFixed(1)}%
- HHI 集中度: ${ctx.riskConstraints.hhi} (${ctx.riskConstraints.concentrationLevel})
- 市场环境: ${ctx.riskConstraints.currentRegime}

### 近期决策记录
${decisionsText}

## 你的任务

基于以上信息，输出一个严格的 JSON 对象（不要添加任何其他文本）：

{
  "conclusion": "act" 或 "watch" 或 "hold",
  "reason": "最多2句话的结论理由",
  "dissent": "反方观点——如果有席位不同意多数意见，说明分歧",
  "risk_warning": "当前最值得注意的风险",
  "missing_info": "做出更好决策还需要什么信息",
  "action_items": [
    {
      "asset_key": "市场:标的",
      "suggested_action": "具体操作建议",
      "rationale": "为什么今天变了",
      "confidence": 0-100
    }
  ]
}

规则：
1. action_items 仅在 conclusion 为 "act" 时提供，watch/hold 时省略该字段
2. reason 不超过 2 句话
3. 不要预测市场走势，只基于信号席位的结构化结论进行归纳
4. 如果四个席位意见基本一致，直接给出结论；如果有明显分歧，在 dissent 中说明
5. 只输出 JSON，不要有任何前缀或后缀文字`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse LLM response
// ─────────────────────────────────────────────────────────────────────────────

function parseLlmResponse(text: string): Omit<TodayLlmOutput, "status" | "generatedAt"> | null {
  try {
    // 先尝试直接解析整段文本
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text.trim()) as Record<string, unknown>;
    } catch {
      // LLM 可能在 JSON 前后加了多余文字
      // 找到第一个 { 和最后一个 } 之间的内容尝试解析
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace <= firstBrace) return null;
      const candidate = text.slice(firstBrace, lastBrace + 1);
      parsed = JSON.parse(candidate) as Record<string, unknown>;
    }

    const conclusion = parsed.conclusion;
    if (conclusion !== "act" && conclusion !== "watch" && conclusion !== "hold") return null;

    return {
      conclusion,
      reason: String(parsed.reason ?? ""),
      dissent: String(parsed.dissent ?? ""),
      riskWarning: String(parsed.risk_warning ?? ""),
      missingInfo: String(parsed.missing_info ?? ""),
      actionItems: conclusion === "act" && Array.isArray(parsed.action_items)
        ? (parsed.action_items as Array<Record<string, unknown>>).map((item) => ({
            assetKey: String(item.asset_key ?? ""),
            suggestedAction: String(item.suggested_action ?? ""),
            rationale: String(item.rationale ?? ""),
            confidence: Math.round(Number(item.confidence) || 50),
          }))
        : undefined,
    };
  } catch (err) {
    logSwallowed("todayLlmPrompt.parseLlmResponse", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 调用 LLM 生成今日决策结论。
 * 失败时返回 degraded 状态（不阻塞页面渲染）。
 */
export async function generateTodayDecision(ctx: TodayDecisionContext): Promise<TodayLlmOutput> {
  const now = new Date().toISOString();

  try {
    const config = await resolveLlmConfig();
    if (!config.enabled) {
      return buildDegradedOutput("LLM 未启用", now);
    }

    const prompt = buildPrompt(ctx);
    console.log("[todayLlm] calling LLM, model:", config.model, "endpoint:", config.endpoint, "timeoutMs:", config.timeoutMs);
    const { text, raw } = await callLlm(config, prompt);

    // 调试日志
    console.log("[todayLlm] model:", config.model, "text.length:", text.length, "text.preview:", text.slice(0, 500));
    console.log("[todayLlm] raw keys:", Object.keys(raw as Record<string, unknown>), "raw.preview:", JSON.stringify(raw).slice(0, 800));

    const parsed = parseLlmResponse(text);

    if (!parsed) {
      console.log("[todayLlm] parse failed, full text:", text.slice(0, 1000));
      return buildDegradedOutput("LLM 输出格式无法解析", now);
    }

    return {
      status: "ok",
      ...parsed,
      generatedAt: now,
    };
  } catch (err) {
    logSwallowed("todayLlmPrompt.generateTodayDecision", err);
    return buildDegradedOutput(
      err instanceof Error ? err.message : "LLM 调用失败",
      now,
    );
  }
}

function buildDegradedOutput(reason: string, generatedAt: string): TodayLlmOutput {
  return {
    status: "degraded",
    conclusion: "watch",
    reason: `AI 分析暂不可用: ${reason}`,
    dissent: "",
    riskWarning: "无法获取 AI 分析，请依据信号席位自行判断",
    missingInfo: "",
    generatedAt,
  };
}
