/**
 * act/createThesis — 创建新研究论点
 *
 * 从 prioritizeNode 中解耦出来，作为独立工具。
 * 需要审批确认（requiresApproval: true）。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "create_thesis",
    description: "创建一个新的研究论点（投资假说）。包含标题、论点文本、关联资产和标签。创建后自动进入调查队列。",
    category: "act",
    parameters: {
      title: { type: "string", description: "论点标题", required: true },
      thesisText: { type: "string", description: "论点描述", required: true },
      assetKeys: { type: "string", description: "关联资产（逗号分隔，如 US:AAPL,US:MSFT）", required: true },
      tags: { type: "string", description: "标签（逗号分隔，如 macro,tech）" },
    },
    outputSchema: {
      threadId: "string",
      title: "string",
    },
    requiresApproval: true,
    tags: ["thesis", "create", "research"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const title = String(params.title || "").trim();
    const thesisText = String(params.thesisText || "").trim();
    const assetKeysStr = String(params.assetKeys || "").trim();

    if (!title || !thesisText || !assetKeysStr) {
      return { toolName: "create_thesis", category: "act", success: false, data: null, outputFields: {}, error: "缺少必填参数 title / thesisText / assetKeys", latencyMs: Date.now() - t0 };
    }

    const assetKeys = assetKeysStr.split(",").map(s => s.trim()).filter(Boolean);
    const tags = String(params.tags || "").split(",").map(s => s.trim()).filter(Boolean);

    try {
      const thesisStore = await import("@/src/daa/agent/store/thesisStore");

      // 去重检查
      const existing = await thesisStore.findSimilarThesis(assetKeys, title);
      if (existing) {
        return {
          toolName: "create_thesis", category: "act", success: false, data: null, outputFields: {},
          error: `已存在类似论点: "${existing.title}"（ID: ${existing.id}）`,
          latencyMs: Date.now() - t0,
        };
      }

      const created = await thesisStore.createResearchThread({
        title,
        thesisText,
        assetKeys,
        tags,
        conviction: "uncertain",
        reviewAt: new Date(Date.now() + 14 * 86400000), // 14 天后复盘
      });

      const data = {
        threadId: created.id,
        title: created.title,
        status: created.status,
        conviction: created.conviction,
        assetKeys: created.assetKeys,
        tags: created.tags,
        reviewAt: created.reviewAt,
      };

      return {
        toolName: "create_thesis",
        category: "act",
        success: true,
        data,
        outputFields: { threadId: created.id, title: created.title },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.create_thesis", e);
      return { toolName: "create_thesis", category: "act", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
