/**
 * Entity Backfill — 为存量记忆和论点补齐实体图
 *
 * 幂等：只处理还没有 entity link 的条目。可反复运行，增量处理。
 * 每次最多 limit 条以避免长事务；通过 cron 每日凌晨调度。
 */

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  extractEntitiesFromMemory,
  extractEntitiesFromThesis,
} from "@/src/daa/agent/entities/entityExtractor";
import {
  upsertAndLinkForMemory,
  upsertAndLinkForThesis,
} from "@/src/daa/agent/entities/entityStore";

export interface EntityBackfillResult {
  memoriesScanned: number;
  memoriesLinked: number;
  memoryEntitiesCreated: number;
  thesesScanned: number;
  thesesLinked: number;
  thesisEntitiesCreated: number;
  errors: number;
}

/**
 * 回填指定上限的记忆和论点。推荐每次 200 条，每日凌晨跑即可清空积压。
 */
export async function runEntityBackfill(opts: {
  memoryLimit?: number;
  thesisLimit?: number;
} = {}): Promise<EntityBackfillResult> {
  const memoryLimit = opts.memoryLimit ?? 200;
  const thesisLimit = opts.thesisLimit ?? 200;

  const result: EntityBackfillResult = {
    memoriesScanned: 0,
    memoriesLinked: 0,
    memoryEntitiesCreated: 0,
    thesesScanned: 0,
    thesesLinked: 0,
    thesisEntitiesCreated: 0,
    errors: 0,
  };

  // ── 记忆回填 ──
  const memRows = await withDaaPgClient(async ({ query }) => {
    // 只取没有任何 entity link 的记忆（幂等）
    const res = await query(
      `SELECT m.id, m.content, m.relevance_tags
       FROM daa_agent_memory m
       LEFT JOIN daa_memory_entity_link l ON l.memory_id = m.id
       WHERE l.memory_id IS NULL
       ORDER BY m.created_at DESC
       LIMIT $1`,
      [memoryLimit],
    );
    return res.rows as Array<{ id: string; content: string; relevance_tags: string[] }>;
  });

  result.memoriesScanned = memRows.length;
  for (const row of memRows) {
    try {
      const entities = extractEntitiesFromMemory({
        content: String(row.content),
        relevanceTags: Array.isArray(row.relevance_tags) ? row.relevance_tags : [],
      });
      if (entities.length === 0) continue;
      const created = await upsertAndLinkForMemory(String(row.id), entities);
      if (created > 0) {
        result.memoriesLinked += 1;
        result.memoryEntitiesCreated += created;
      }
    } catch (e) {
      result.errors += 1;
      logSwallowed("entityBackfill.memory", e);
    }
  }

  // ── 论点回填 ──
  const thesisRows = await withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT t.id, t.title, t.thesis_text, t.asset_keys, t.tags
       FROM daa_research_threads t
       LEFT JOIN daa_thesis_entity_link l ON l.thesis_id = t.id
       WHERE l.thesis_id IS NULL
       ORDER BY t.updated_at DESC
       LIMIT $1`,
      [thesisLimit],
    );
    return res.rows as Array<{
      id: string;
      title: string;
      thesis_text: string;
      asset_keys: string[];
      tags: string[];
    }>;
  });

  result.thesesScanned = thesisRows.length;
  for (const row of thesisRows) {
    try {
      const entities = extractEntitiesFromThesis({
        id: String(row.id),
        title: String(row.title ?? ""),
        thesisText: String(row.thesis_text ?? ""),
        assetKeys: Array.isArray(row.asset_keys) ? row.asset_keys : [],
        tags: Array.isArray(row.tags) ? row.tags : [],
      });
      if (entities.length === 0) continue;
      const created = await upsertAndLinkForThesis(String(row.id), entities);
      if (created > 0) {
        result.thesesLinked += 1;
        result.thesisEntitiesCreated += created;
      }
    } catch (e) {
      result.errors += 1;
      logSwallowed("entityBackfill.thesis", e);
    }
  }

  return result;
}
