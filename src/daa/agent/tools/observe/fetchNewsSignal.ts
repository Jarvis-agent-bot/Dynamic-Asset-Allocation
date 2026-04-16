/**
 * observe/fetchNewsSignal — 获取资产新闻信号
 *
 * 迁移自 agentToolExecutors.ts executeFetchNewsSignal
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function makeResult(success: boolean, data: unknown, outputFields: Record<string, unknown>, t0: number, error?: string): ToolResultV2 {
  return { toolName: "fetch_news_signal", category: "observe", success, data, outputFields, error, latencyMs: Date.now() - t0 };
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
      const market = symbol.endsWith(".HK") ? "HK" : symbol.endsWith(".SS") || symbol.endsWith(".SZ") ? "CN" : "US";
      const signal = await buildNewsSignalForSymbol(symbol, market);
      if (!signal) return makeResult(false, null, {}, t0, `${symbol} 无新闻信号数据`);

      const s = signal as Record<string, unknown>;
      const data = {
        scorePct: s.scorePct,
        evidenceCount: s.evidenceCount,
        llmSummary: s.llmSummary,
        llmDrivers: s.llmDrivers,
        llmMajorEvent: s.llmMajorEvent,
        reasons: s.reasons,
        items: Array.isArray(s.items)
          ? (s.items as Array<Record<string, unknown>>).slice(0, 5).map((i) => ({ title: i.title, ts: i.ts }))
          : [],
      };
      return makeResult(true, data, {
        scorePct: s.scorePct as number,
        evidenceCount: s.evidenceCount as number,
        llmSummary: s.llmSummary as string,
        symbol,
      }, t0);
    } catch (e) {
      logSwallowed("toolV2.fetch_news_signal", e);
      return makeResult(false, null, {}, t0, e instanceof Error ? e.message : String(e));
    }
  },
);
