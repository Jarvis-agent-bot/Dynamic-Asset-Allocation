/**
 * Memory Store — Agent 长期记忆的持久化层（pgvector 语义检索）
 */

import { randomUUID } from "node:crypto";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import type { AgentMemory, MemoryType } from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function mapMemoryRow(r: Record<string, unknown>): AgentMemory {
  return {
    id: String(r.id),
    memoryType: String(r.memory_type) as MemoryType,
    content: String(r.content),
    sourceRunIds: Array.isArray(r.source_run_ids) ? (r.source_run_ids as string[]) : [],
    relevanceTags: Array.isArray(r.relevance_tags) ? (r.relevance_tags as string[]) : [],
    embedding: null, // 不返回原始 embedding 向量
    strength: Number(r.strength ?? 1),
    createdAt: String(r.created_at),
    lastAccessed: String(r.last_accessed),
  };
}

export async function createMemory(data: {
  memoryType: MemoryType;
  content: string;
  sourceRunIds?: string[];
  relevanceTags?: string[];
  embedding?: number[];
}): Promise<AgentMemory> {
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const embeddingStr = data.embedding ? `[${data.embedding.join(",")}]` : null;
    const res = await query(
      `INSERT INTO daa_agent_memory (id, memory_type, content, source_run_ids, relevance_tags, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)
       RETURNING *`,
      [id, data.memoryType, data.content, data.sourceRunIds ?? [], data.relevanceTags ?? [], embeddingStr],
    );
    return mapMemoryRow(res.rows[0]);
  });
}

/**
 * 语义检索：通过 pgvector 余弦相似度搜索最相关的记忆。
 * 如果没有 embedding，退回到 tag 匹配。
 */
/**
 * 语义检索：通过 pgvector 余弦相似度搜索最相关的记忆。
 * P2-10: 支持 tags 参数优先召回与特定 thesis 关联的记忆。
 */
export async function recallMemory(opts: {
  queryEmbedding?: number[];
  tags?: string[];
  limit?: number;
}): Promise<AgentMemory[]> {
  const limit = opts.limit ?? 5;

  return withDaaPgClient(async ({ query }) => {
    // 优先用向量搜索
    if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
      try {
        const embStr = `[${opts.queryEmbedding.join(",")}]`;
        // 2D: 按 similarity × strength 加权排序（强记忆 + 高相关性优先）
        const res = await query(
          `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
           FROM daa_agent_memory
           WHERE embedding IS NOT NULL AND strength >= 0.05
           ORDER BY (1 - (embedding <=> $1::vector)) * strength DESC
           LIMIT $2`,
          [embStr, limit],
        );
        if (res.rows.length > 0) {
          // 更新 last_accessed
          const ids = res.rows.map(r => String(r.id));
          await query(
            `UPDATE daa_agent_memory SET last_accessed = now() WHERE id = ANY($1)`,
            [ids],
          ).catch(e => logSwallowed("memoryStore.updateAccess", e));
          return res.rows.map(mapMemoryRow);
        }
      } catch (e) {
        logSwallowed("memoryStore.vectorSearch", e);
      }
    }

    // 退回到 tag 匹配
    if (opts.tags && opts.tags.length > 0) {
      const res = await query(
        `SELECT * FROM daa_agent_memory
         WHERE relevance_tags && $1 AND strength >= 0.05
         ORDER BY strength DESC, created_at DESC
         LIMIT $2`,
        [opts.tags, limit],
      );
      return res.rows.map(mapMemoryRow);
    }

    // 最终退回：最近最强的记忆
    const res = await query(
      `SELECT * FROM daa_agent_memory WHERE strength >= 0.05 ORDER BY strength DESC, created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapMemoryRow);
  });
}

export async function updateMemoryStrength(id: string, delta: number = 0.1): Promise<void> {
  await withDaaPgClient(async ({ query }) => {
    await query(
      `UPDATE daa_agent_memory SET strength = strength + $1, last_accessed = now() WHERE id = $2`,
      [delta, id],
    );
  });
}

/**
 * 分页列出所有记忆，支持按类型过滤。
 */
export async function listMemories(opts: {
  type?: MemoryType;
  limit?: number;
  offset?: number;
}): Promise<{ items: AgentMemory[]; total: number }> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  return withDaaPgClient(async ({ query }) => {
    const conditions = opts.type ? "WHERE memory_type = $1" : "";
    const params: unknown[] = opts.type ? [opts.type] : [];

    const countRes = await query(
      `SELECT COUNT(*) as cnt FROM daa_agent_memory ${conditions}`,
      params,
    );
    const total = Number(countRes.rows[0]?.cnt ?? 0);

    const dataParams = opts.type ? [opts.type, limit, offset] : [limit, offset];
    const limitIdx = opts.type ? "$2" : "$1";
    const offsetIdx = opts.type ? "$3" : "$2";

    const dataRes = await query(
      `SELECT * FROM daa_agent_memory ${conditions} ORDER BY strength DESC, created_at DESC LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
      dataParams,
    );

    return {
      items: dataRes.rows.map(mapMemoryRow),
      total,
    };
  });
}

/**
 * 删除单条记忆。
 */
export async function deleteMemory(id: string): Promise<void> {
  await withDaaPgClient(async ({ query }) => {
    await query(`DELETE FROM daa_agent_memory WHERE id = $1`, [id]);
  });
}

/**
 * Feature E: 批量衰减记忆强度。
 * 公式: new_strength = strength × decayRate^(days_since_last_access)
 * 只处理 last_accessed > 1 天前且 strength > 0.01 的记忆。
 */
export async function applyMemoryDecay(decayRate: number = 0.97): Promise<number> {
  return withDaaPgClient(async ({ query }) => {
    // 2A: 先硬删除僵尸记忆（strength < 0.01 且 30 天未访问）
    await query(
      `DELETE FROM daa_agent_memory
       WHERE strength < 0.01 AND last_accessed < NOW() - INTERVAL '30 days'`,
    ).catch(e => logSwallowed("memoryStore.zombieCleanup", e));

    // 衰减仍活跃的记忆
    const res = await query(
      `UPDATE daa_agent_memory
       SET strength = strength * POWER($1, EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400)
       WHERE last_accessed < NOW() - INTERVAL '1 day'
         AND strength > 0.01
       RETURNING id`,
      [decayRate],
    );
    return res.rows.length;
  });
}

export async function countMemories(): Promise<number> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT COUNT(*) as cnt FROM daa_agent_memory`);
    return Number(res.rows[0]?.cnt ?? 0);
  });
}
