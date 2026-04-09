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
        const res = await query(
          `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
           FROM daa_agent_memory
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
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
         WHERE relevance_tags && $1
         ORDER BY strength DESC, created_at DESC
         LIMIT $2`,
        [opts.tags, limit],
      );
      return res.rows.map(mapMemoryRow);
    }

    // 最终退回：最近最强的记忆
    const res = await query(
      `SELECT * FROM daa_agent_memory ORDER BY strength DESC, created_at DESC LIMIT $1`,
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

export async function countMemories(): Promise<number> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT COUNT(*) as cnt FROM daa_agent_memory`);
    return Number(res.rows[0]?.cnt ?? 0);
  });
}
