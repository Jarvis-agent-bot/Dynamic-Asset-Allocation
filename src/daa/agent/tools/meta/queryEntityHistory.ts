/**
 * meta/queryEntityHistory — 查询实体图关联的历史记忆与投资判断
 *
 * 支持 6 种实体：asset / thesis_id / regime / ticker / news_source / strategy_tag
 * 回答 "关于 NVDA 学到了什么"、"risk_off 下的历史 pattern" 这类跨资产因果查询。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  getMemoriesByEntity,
  getThesesByEntity,
  getCoMentionedEntities,
  findEntity,
} from "@/src/daa/agent/entities/entityStore";
import type { EntityKind } from "@/src/daa/agent/entities/entityExtractor";

const VALID_KINDS: EntityKind[] = [
  "asset", "thesis_id", "regime", "ticker", "news_source", "strategy_tag",
];

registerTool(
  {
    name: "query_entity_history",
    description: "查询实体图中关联的历史记忆与投资判断。回答类似'关于 NVDA 学到过什么'、'risk_off 环境下历史 pattern'、'reuters 报道过的判断'。kind 取值：asset / thesis_id / regime / ticker / news_source / strategy_tag。",
    category: "meta",
    parameters: {
      kind: { type: "string", description: "实体类型", required: true },
      value: { type: "string", description: "实体值（如 NVDA / US::AAPL / risk_off）", required: true },
      limit: { type: "number", description: "每类最多返回（默认 5，上限 20）" },
    },
    outputSchema: {
      memoryCount: "number",
      thesisCount: "number",
      coEntityCount: "number",
    },
    tags: ["entity", "causal", "self-reflection"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const kind = String(params.kind ?? "").trim() as EntityKind;
    const value = String(params.value ?? "").trim();
    const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 20);

    if (!VALID_KINDS.includes(kind)) {
      return {
        toolName: "query_entity_history",
        category: "meta",
        success: false,
        data: null,
        outputFields: {},
        error: `不支持的实体类型: ${kind}。合法值: ${VALID_KINDS.join(", ")}`,
        latencyMs: Date.now() - t0,
      };
    }
    if (!value) {
      return {
        toolName: "query_entity_history",
        category: "meta",
        success: false,
        data: null,
        outputFields: {},
        error: "缺少必填参数 value",
        latencyMs: Date.now() - t0,
      };
    }

    try {
      const entity = await findEntity(kind, value);
      if (!entity) {
        return {
          toolName: "query_entity_history",
          category: "meta",
          success: true,
          data: { kind, value, exists: false, memories: [], theses: [], coEntities: [] },
          outputFields: { memoryCount: 0, thesisCount: 0, coEntityCount: 0 },
          latencyMs: Date.now() - t0,
        };
      }

      const [memories, theses, coEntities] = await Promise.all([
        getMemoriesByEntity(kind, value, limit),
        getThesesByEntity(kind, value, limit),
        getCoMentionedEntities(kind, value, limit),
      ]);

      return {
        toolName: "query_entity_history",
        category: "meta",
        success: true,
        data: {
          entity: {
            id: entity.id,
            kind: entity.kind,
            value: entity.value,
            mentionCount: entity.mentionCount,
            firstSeen: entity.firstSeen,
            lastSeen: entity.lastSeen,
          },
          memories: memories.map(m => ({
            id: m.id,
            type: m.memoryType,
            content: m.content,
            strength: m.strength,
            linkWeight: m.linkWeight,
            tags: m.relevanceTags,
            createdAt: m.createdAt,
          })),
          theses: theses.map(t => ({
            id: t.id,
            title: t.title,
            conviction: t.conviction,
            status: t.status,
            assetKeys: t.assetKeys,
            linkWeight: t.linkWeight,
            updatedAt: t.updatedAt,
          })),
          coEntities: coEntities.map(e => ({
            kind: e.kind,
            value: e.value,
            coCount: e.coCount,
            mentionCount: e.mentionCount,
          })),
        },
        outputFields: {
          memoryCount: memories.length,
          thesisCount: theses.length,
          coEntityCount: coEntities.length,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.query_entity_history", e);
      return {
        toolName: "query_entity_history",
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
