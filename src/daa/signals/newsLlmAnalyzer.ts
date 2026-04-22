/**
 * LLM 新闻语义分析器。
 * 将一组新闻标题+摘要传给 LLM，获取结构化情感分析。
 * 替代原来的关键词匹配方式。
 */

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { RawNewsItem } from "./newsProviders";

// ---------------------------------------------------------------------------
// P1-1: LLM 并发限制 — 防止 30+ symbol 批量刷新时打爆 LLM API
// ---------------------------------------------------------------------------
const LLM_CONCURRENCY = 3;
let _running = 0;
const _queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (_running < LLM_CONCURRENCY) {
    _running++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => _queue.push(resolve));
}

function releaseSlot(): void {
  const next = _queue.shift();
  if (next) {
    next(); // 不减 _running，slot 直接移交
  } else {
    _running--;
  }
}

// ---------------------------------------------------------------------------
// P2-5: 新闻文本消毒 — 去除控制字符和潜在注入
// ---------------------------------------------------------------------------
function sanitizeText(text: string, maxLen = 200): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // 控制字符
    .replace(/<[^>]*>/g, "")                              // HTML 标签
    .replace(/\{[\s\S]*?\}/g, (m) =>                      // 保留纯文本大括号，去除可疑 JSON
      m.length > 30 ? "" : m)
    .trim()
    .slice(0, maxLen);
}

/** 推送文案：将 majorEvent.type 枚举映射为中文友好标签。未知值原样返回。 */
export function majorEventTypeLabelZh(type: string): string {
  const key = String(type || "").trim().toLowerCase();
  const map: Record<string, string> = {
    earnings: "财报",
    merger_acquisition: "并购",
    regulatory: "监管",
    lawsuit: "诉讼",
    management_change: "高管变动",
    suspension_delisting: "停牌/退市",
    product_launch: "产品发布",
    strategic_partnership: "战略合作",
    rating_change: "评级变动",
    buyback_offering: "回购/增发",
    other: "其他",
  };
  return map[key] ?? (key || "未分类");
}

export type LlmNewsAnalysis = {
  sentimentScore: number;     // -100 ~ +100
  summary: string;            // 1-2 句概括
  drivers: {
    bullish: string[];        // top 3 利好
    bearish: string[];        // top 3 利空
  };
  majorEvent: {
    type: string;             // earnings/merger/regulatory/lawsuit/product
    impact: string;           // high/medium/low
    description: string;
  } | null;
  actionHint: string;         // 关注/无影响/警惕
};

const DEFAULT_ANALYSIS: LlmNewsAnalysis = {
  sentimentScore: 0,
  summary: "无足够新闻数据进行分析",
  drivers: { bullish: [], bearish: [] },
  majorEvent: null,
  actionHint: "无影响",
};

/**
 * 用 LLM 分析一组新闻。
 * 失败时返回中性默认值（不 throw）。
 */
export async function analyzeNewsWithLlm(input: {
  symbol: string;
  items: RawNewsItem[];
}): Promise<LlmNewsAnalysis> {
  if (input.items.length === 0) return DEFAULT_ANALYSIS;

  try {
    await acquireSlot();
    const config = await resolveLlmConfig("analysis");
    if (!config.enabled || !config.apiKey) return DEFAULT_ANALYSIS;

    const newsLines = input.items.slice(0, 10).map((item, i) => {
      const date = item.publishedAt ? item.publishedAt.slice(0, 10) : "未知日期";
      const source = sanitizeText(item.source || "未知来源", 30);
      const title = sanitizeText(item.title, 150);
      const summary = item.summary ? ` — ${sanitizeText(item.summary, 100)}` : "";
      return `${i + 1}. [${date}] ${title} (${source})${summary}`;
    }).join("\n");

    const prompt = `你是金融新闻分析师。以下是 ${input.symbol} 最近的新闻：

${newsLines}

请分析并以严格 JSON 格式输出（不要 markdown 代码块）：
{
  "sentimentScore": <-100到+100的整数，负面为负，正面为正>,
  "summary": "<1-2句话概括当前新闻面>",
  "drivers": {
    "bullish": ["<利好因素1>", "<利好因素2>"],
    "bearish": ["<利空因素1>", "<利空因素2>"]
  },
  "majorEvent": <见下方判定标准，不符合则填 null。若填对象，"type"必须是下方枚举之一，不可为空>,
  "actionHint": "<关注|无影响|警惕>"
}

majorEvent 结构（若非 null）：
{
  "type": "<必须是以下枚举之一：earnings | merger_acquisition | regulatory | lawsuit | management_change | suspension_delisting | product_launch | strategic_partnership | rating_change | buyback_offering | other>",
  "impact": "<high|medium|low>",
  "description": "<一句话客观描述事件，不要评论>"
}

type 与 impact 的判定标准（必须严格遵守，宁可漏判也不要误判）：
- impact="high" 仅限以下情况的**首次报道**（后续评论、解读、分析师观点不算）：
  · earnings 财报首次公布（当天第一条报道，且包含实际营收/利润数据）
  · merger_acquisition 并购/收购正式公告
  · regulatory 监管处罚/调查正式通知
  · lawsuit 重大诉讼裁决
  · management_change CEO/CFO 变动公告
  · suspension_delisting 停牌/退市风险公告
- 以下不属于 high：
  · 财报发布后的后续报道、市场反应、分析师点评（即使提到具体数据）
  · "业绩创纪录增长"、"利润下滑"等评论性标题
  · 产品发布、战略合作、评级变动（这些是 medium）
- impact="medium"：product_launch | strategic_partnership | rating_change | buyback_offering
- impact="low"：分析师观点、市场传闻、行业一般新闻，type 用 "other"
- 普通的价格波动、市场评论、分析师预测不算重大事件，应填 null
- 如果新闻都是日常报道没有突发事件，majorEvent 必须为 null
- 当你无法确定是否为首次报道时，默认填 impact="medium" 而非 "high"
- **type 字段不能为空字符串或省略，若难以归类请使用 "other"**`;

    const result = await callLlm(config, prompt);
    return parseLlmResponse(result.text);
  } catch (e) {
    logSwallowed("newsLlmAnalyzer.analyze", e);
    return DEFAULT_ANALYSIS;
  } finally {
    releaseSlot();
  }
}

function parseLlmResponse(text: string): LlmNewsAnalysis {
  try {
    // 尝试提取 JSON（LLM 可能包裹在 ```json ``` 里）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_ANALYSIS;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    return {
      sentimentScore: clamp(Number(parsed.sentimentScore) || 0, -100, 100),
      summary: String(parsed.summary || DEFAULT_ANALYSIS.summary).slice(0, 200),
      drivers: {
        bullish: Array.isArray((parsed.drivers as Record<string, unknown>)?.bullish)
          ? ((parsed.drivers as Record<string, unknown>).bullish as string[]).slice(0, 3).map(String)
          : [],
        bearish: Array.isArray((parsed.drivers as Record<string, unknown>)?.bearish)
          ? ((parsed.drivers as Record<string, unknown>).bearish as string[]).slice(0, 3).map(String)
          : [],
      },
      majorEvent: (() => {
        const raw = parsed.majorEvent;
        if (!raw || typeof raw !== "object") return null;
        const rawType = String((raw as Record<string, unknown>).type || "").trim();
        const rawImpact = String((raw as Record<string, unknown>).impact || "medium").trim().toLowerCase();
        const rawDesc = String((raw as Record<string, unknown>).description || "").trim();
        // type 必须非空；LLM 没给就归类为 "other"，避免推送文案出现 "类型: "
        const type = rawType || "other";
        const impact = ["high", "medium", "low"].includes(rawImpact) ? rawImpact : "medium";
        return { type, impact, description: rawDesc };
      })(),
      actionHint: String(parsed.actionHint || "无影响"),
    };
  } catch (e) {
    logSwallowed("newsLlmAnalyzer.parse", e);
    return DEFAULT_ANALYSIS;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
