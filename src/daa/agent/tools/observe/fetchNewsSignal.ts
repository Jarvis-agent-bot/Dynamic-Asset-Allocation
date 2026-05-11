/**
 * observe/fetchNewsSignal — 获取资产新闻信号
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function makeResult(success: boolean, data: unknown, outputFields: Record<string, unknown>, t0: number, error?: string): ToolResultV2 {
  return { toolName: "fetch_news_signal", category: "observe", success, data, outputFields, error, latencyMs: Date.now() - t0 };
}

function inferMarketFromSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.includes("=F")) return "COMMODITY";
  if (s.endsWith(".HK")) return "HK";
  if (s.endsWith(".SS") || s.endsWith(".SZ")) return "CN";
  if (s.endsWith(".KS")) return "KR";
  if (s.endsWith(".T")) return "JP";
  return "US";
}

registerTool(
  {
    name: "fetch_news_signal",
    description: "获取指定资产的新闻信号（LLM 情感分析/重大事件/行动建议/利好利空因素）。适合判断市场情绪和事件驱动。",
    category: "observe",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
    },
    outputSchema: {
      scorePct: "number",
      evidenceCount: "number",
      llmSummary: "string",
    },
    tags: ["news", "signal", "sentiment"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const symbol = String(params.symbol || "");
    if (!symbol) return makeResult(false, null, {}, t0, "缺少必填参数 symbol");

    try {
      const { buildNewsSignalForSymbol } = await import("@/src/daa/signals/newsSignal");
      const market = inferMarketFromSymbol(symbol);
      const signal = await buildNewsSignalForSymbol(symbol, market);
      if (!signal) return makeResult(false, null, {}, t0, `${symbol} 无新闻信号数据`);

      const data = {
        scorePct: signal.scorePct,
        confidencePct: signal.confidencePct,
        evidenceCount: signal.evidenceCount,
        llmSummary: signal.llmSummary,
        llmDrivers: signal.llmDrivers,
        llmMajorEvent: signal.llmMajorEvent,
        llmActionHint: signal.llmActionHint,
        reasons: signal.reasons,
        items: signal.items.slice(0, 5).map((item) => ({
          title: item.title,
          ts: item.ts,
          sourceCredibility: item.sourceCredibility,
          freshness: item.freshness,
        })),
      };
      return makeResult(true, data, {
        scorePct: signal.scorePct,
        confidencePct: signal.confidencePct,
        evidenceCount: signal.evidenceCount,
        llmSummary: signal.llmSummary,
        llmActionHint: signal.llmActionHint,
        symbol,
      }, t0);
    } catch (e) {
      logSwallowed("toolV2.fetch_news_signal", e);
      return makeResult(false, null, {}, t0, e instanceof Error ? e.message : String(e));
    }
  },
);
