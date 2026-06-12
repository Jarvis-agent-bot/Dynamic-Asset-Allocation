/**
 * meta/searchPastReasoning — 按关键字搜索历史记忆与依据
 *
 * 基于 pg_trgm 子串匹配，回答"我之前在哪里思考过 XX"类问题。
 * 与语义召回互补：命中精确的 ticker、数字、专有名词。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { searchMemoriesByKeyword } from "@/src/daa/agent/store/memoryStore";
import { searchEvidenceByKeyword } from "@/src/daa/agent/store/thesisStore";

registerTool(
  {
    name: "search_past_reasoning",
    description: "按关键字（ticker、术语、事件名）搜索历史记忆（lesson/pattern/preference/fact）和复核依据。适合回答'之前有没有推理过 XX'这类精确匹配需求。",
    category: "meta",
    parameters: {
      keyword: { type: "string", description: "搜索关键字（支持中英文、ticker）", required: true },
      limit: { type: "number", description: "返回总条数上限（默认 8，上限 20）" },
    },
    outputSchema: {
      memoryCount: "number",
      evidenceCount: "number",
      topHit: "string",
    },
    tags: ["episodic", "keyword", "self-reflection"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const keyword = String(params.keyword ?? "").trim();
    if (!keyword) {
      return {
        toolName: "search_past_reasoning",
        category: "meta",
        success: false,
        data: null,
        outputFields: {},
        error: "缺少必填参数 keyword",
        latencyMs: Date.now() - t0,
      };
    }
    const limit = Math.min(Math.max(Number(params.limit) || 8, 1), 20);
    const perSource = Math.ceil(limit / 2);

    try {
      const [memories, evidence] = await Promise.all([
        searchMemoriesByKeyword(keyword, { limit: perSource }),
        searchEvidenceByKeyword(keyword, { limit: perSource }),
      ]);

      const topHit = memories[0]?.content.slice(0, 80)
        ?? evidence[0]?.content.slice(0, 80)
        ?? "";

      return {
        toolName: "search_past_reasoning",
        category: "meta",
        success: true,
        data: {
          keyword,
          memories: memories.map(m => ({
            id: m.id,
            type: m.memoryType,
            content: m.content,
            strength: m.strength,
            tags: m.relevanceTags,
            createdAt: m.createdAt,
          })),
          evidence: evidence.map(e => ({
            threadId: e.threadId,
            threadTitle: e.threadTitle,
            evidenceType: e.evidenceType,
            source: e.source,
            content: e.content,
            createdAt: e.createdAt,
          })),
        },
        outputFields: {
          memoryCount: memories.length,
          evidenceCount: evidence.length,
          topHit,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.search_past_reasoning", e);
      return {
        toolName: "search_past_reasoning",
        category: "meta",
        success: false,
        data: null,
        outputFields: {},
        error: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - t0,
      };
    }
  },
);
