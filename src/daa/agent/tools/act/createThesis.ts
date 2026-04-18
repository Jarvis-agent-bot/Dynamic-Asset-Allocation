/**
 * act/createThesis — 创建新研究论点
 *
 * 从 prioritizeNode 中解耦出来，作为独立工具。
 * 需要审批确认（requiresApproval: true）。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { buildDaaAssetKey, parseDaaAssetKey } from "@/src/daa/assetKey";

/**
 * 归一化 LLM 传入的 assetKeys — 接受以下三种形式，统一输出 `MARKET::SYMBOL`（双冒号）：
 *   - "US::AAPL"   (已经是规范格式) → 原样返回
 *   - "US:AAPL"    (单冒号)         → 转为 "US::AAPL"
 *   - "AAPL"       (裸 symbol)      → 默认 "US::AAPL"
 * 无法归一化的条目直接丢弃。
 */
function normalizeAssetKeysFromLlm(raw: string): string[] {
  return raw.split(",").map(s => s.trim()).filter(Boolean).map(item => {
    const upper = item.toUpperCase();
    const normalized = parseDaaAssetKey(upper);
    if (normalized) return buildDaaAssetKey(normalized.symbol, normalized.market);
    // 尝试单冒号形式
    const singleColonIdx = upper.indexOf(":");
    if (singleColonIdx > 0 && !upper.includes("::")) {
      const market = upper.slice(0, singleColonIdx);
      const symbol = upper.slice(singleColonIdx + 1);
      if (market && symbol) return buildDaaAssetKey(symbol, market);
    }
    // 裸 symbol → 默认 US 市场
    if (upper && !upper.includes(":")) return buildDaaAssetKey(upper, "US");
    return "";
  }).filter(Boolean);
}

registerTool(
  {
    name: "create_thesis",
    description: "创建一个新的研究论点（投资假说）。包含标题、论点文本、关联资产和标签。创建后自动进入调查队列。",
    category: "act",
    parameters: {
      title: { type: "string", description: "论点标题", required: true },
      thesisText: { type: "string", description: "论点描述", required: true },
      assetKeys: { type: "string", description: "关联资产（逗号分隔，格式 MARKET::SYMBOL，如 US::AAPL,US::MSFT）", required: true },
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

    const assetKeys = normalizeAssetKeysFromLlm(assetKeysStr);
    if (assetKeys.length === 0) {
      return { toolName: "create_thesis", category: "act", success: false, data: null, outputFields: {}, error: `assetKeys 无法归一化: "${assetKeysStr}"`, latencyMs: Date.now() - t0 };
    }
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
