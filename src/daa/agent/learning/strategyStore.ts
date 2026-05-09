/**
 * Strategy Store — 调查策略的 CRUD 和匹配
 *
 * 对应 DB 表 daa_agent_strategies（已在 runtimeMigrations 中创建）。
 */

import type { InvestigationStrategy, StrategyMatchContext } from "@/src/daa/agent/learning/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type StrategyRow = {
  id: string; name: string; description: string;
  trigger_conditions: string; tool_sequence: string[];
  prompt_template: string; source_run_ids: string[];
  success_rate: number; usage_count: number;
  created_at: string; updated_at: string;
};

// ── 查询 ──

/** 获取所有策略（按 successRate * usageCount 降序） */
export async function listStrategies(limit = 20): Promise<InvestigationStrategy[]> {
  try {
    const { withDaaPgClient } = await import("@/src/daa/pg/daaPg");
    const rows = await withDaaPgClient(async (client) => {
      const res = await client.query(
        `SELECT * FROM daa_agent_strategies
         ORDER BY success_rate * usage_count DESC
         LIMIT $1`,
        [limit],
      );
      return res.rows as StrategyRow[];
    });
    return rows.map(mapRow);
  } catch (e) {
    logSwallowed("strategyStore.list", e);
    return [];
  }
}

/**
 * 匹配适用的策略（按相关性排序，最多 3 条）。
 *
 * 匹配逻辑（简单文本匹配，不需要 SQL 解析器）：
 * - triggerConditions 中包含当前 regime → 加分
 * - triggerConditions 中包含当前 conviction → 加分
 * - 按 successRate * usageCount 加权
 */
export async function findMatchingStrategies(
  ctx: StrategyMatchContext,
  limit = 3,
): Promise<InvestigationStrategy[]> {
  try {
    const all = await listStrategies(50);
    if (all.length === 0) return [];

    // 评分排序
    const scored = all.map(s => {
      let score = s.successRate * Math.log2(s.usageCount + 1); // 基础分
      const cond = s.triggerConditions.toLowerCase();
      if (ctx.regime && cond.includes(ctx.regime.toLowerCase())) score += 2;
      if (ctx.conviction && cond.includes(ctx.conviction.toLowerCase())) score += 1;
      // tag 重叠加分
      for (const tag of ctx.tags) {
        if (cond.includes(tag.toLowerCase())) score += 0.5;
      }
      return { strategy: s, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.strategy);
  } catch (e) {
    logSwallowed("strategyStore.findMatching", e);
    return [];
  }
}

// ── 写入 ──

/** 创建新策略 */
export async function createStrategy(input: {
  name: string;
  description: string;
  triggerConditions: string;
  toolSequence: string[];
  promptTemplate: string;
  sourceRunIds: string[];
  successRate?: number;
}): Promise<InvestigationStrategy | null> {
  try {
    const { withDaaPgClient } = await import("@/src/daa/pg/daaPg");
    const rows = await withDaaPgClient(async (client) => {
      const res = await client.query(
        `INSERT INTO daa_agent_strategies
         (name, description, trigger_conditions, tool_sequence, prompt_template, source_run_ids, success_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.name,
          input.description,
          input.triggerConditions,
          input.toolSequence,
          input.promptTemplate,
          input.sourceRunIds,
          input.successRate ?? 0,
        ],
      );
      return res.rows as StrategyRow[];
    });
    return rows.length > 0 ? mapRow(rows[0]) : null;
  } catch (e) {
    logSwallowed("strategyStore.create", e);
    return null;
  }
}

// ── 内部 ──

function mapRow(row: StrategyRow): InvestigationStrategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    triggerConditions: row.trigger_conditions,
    toolSequence: row.tool_sequence ?? [],
    promptTemplate: row.prompt_template ?? "",
    sourceRunIds: row.source_run_ids ?? [],
    successRate: row.success_rate ?? 0,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
