/**
 * LLM 新闻语义分析器。
 * 将一组新闻标题+摘要传给 LLM，获取结构化情感分析。
 * 替代原来的关键词匹配方式。
 */

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { RawNewsItem } from "./newsProviders";

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
    const config = await resolveLlmConfig();
    if (!config.enabled || !config.apiKey) return DEFAULT_ANALYSIS;

    const newsLines = input.items.slice(0, 10).map((item, i) => {
      const date = item.publishedAt ? item.publishedAt.slice(0, 10) : "未知日期";
      const source = item.source || "未知来源";
      const summary = item.summary ? ` — ${item.summary.slice(0, 100)}` : "";
      return `${i + 1}. [${date}] ${item.title} (${source})${summary}`;
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
  "majorEvent": <如果有重大事件则填写 {"type":"earnings|merger|regulatory|lawsuit|product","impact":"high|medium|low","description":"简述"}，否则 null>,
  "actionHint": "<关注|无影响|警惕>"
}`;

    const result = await callLlm(config, prompt);
    return parseLlmResponse(result.text);
  } catch (e) {
    logSwallowed("newsLlmAnalyzer.analyze", e);
    return DEFAULT_ANALYSIS;
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
      majorEvent: parsed.majorEvent && typeof parsed.majorEvent === "object"
        ? {
            type: String((parsed.majorEvent as Record<string, unknown>).type || ""),
            impact: String((parsed.majorEvent as Record<string, unknown>).impact || "medium"),
            description: String((parsed.majorEvent as Record<string, unknown>).description || ""),
          }
        : null,
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
