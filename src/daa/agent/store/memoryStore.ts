/**
 * Memory Store — Agent 长期记忆的持久化层（pgvector 语义检索）
 */

import { randomUUID } from "node:crypto";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import type { AgentMemory, MemoryType } from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";

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
  /** 可选：关联的 thesis（用于实体图的 asset/ticker 抽取） */
  thread?: { id: string; assetKeys?: string[]; tags?: string[] };
}): Promise<AgentMemory> {
  const ownerAccountId = getDaaAccountScopeId();
  const created = await withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const embeddingStr = data.embedding ? `[${data.embedding.join(",")}]` : null;
    const res = await query(
      `INSERT INTO daa_agent_memory (owner_account_id, id, memory_type, content, source_run_ids, relevance_tags, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
       RETURNING *`,
      [ownerAccountId, id, data.memoryType, data.content, data.sourceRunIds ?? [], data.relevanceTags ?? [], embeddingStr],
    );
    return mapMemoryRow(res.rows[0]);
  });

  // 实体图：抽取并链接（失败不影响主流程）
  try {
    const { extractEntitiesFromMemory } = await import("@/src/daa/agent/entities/entityExtractor");
    const { upsertAndLinkForMemory } = await import("@/src/daa/agent/entities/entityStore");
    const entities = extractEntitiesFromMemory({
      content: data.content,
      relevanceTags: data.relevanceTags,
      thread: data.thread,
    });
    await upsertAndLinkForMemory(created.id, entities);
  } catch (e) {
    logSwallowed("memoryStore.createMemory.entityLink", e);
  }

  return created;
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
  const ownerAccountId = getDaaAccountScopeId();

  return withDaaPgClient(async ({ query }) => {
    // 优先用向量搜索
    if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
      try {
        const embStr = `[${opts.queryEmbedding.join(",")}]`;
        // 2D: 按 similarity × strength 加权排序（强记忆 + 高相关性优先）
        const res = await query(
          `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
           FROM daa_agent_memory
           WHERE owner_account_id = $3 AND embedding IS NOT NULL AND strength >= 0.05
           ORDER BY (1 - (embedding <=> $1::vector)) * strength DESC
           LIMIT $2`,
          [embStr, limit, ownerAccountId],
        );
        if (res.rows.length > 0) {
          // 更新 last_accessed
          const ids = res.rows.map(r => String(r.id));
          await query(
            `UPDATE daa_agent_memory SET last_accessed = now() WHERE owner_account_id = $1 AND id = ANY($2)`,
            [ownerAccountId, ids],
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
         WHERE owner_account_id = $3 AND relevance_tags && $1 AND strength >= 0.05
         ORDER BY strength DESC, created_at DESC
         LIMIT $2`,
        [opts.tags, limit, ownerAccountId],
      );
      return res.rows.map(mapMemoryRow);
    }

    // 最终退回：最近最强的记忆
    const res = await query(
      `SELECT * FROM daa_agent_memory WHERE owner_account_id = $1 AND strength >= 0.05 ORDER BY strength DESC, created_at DESC LIMIT $2`,
      [ownerAccountId, limit],
    );
    return res.rows.map(mapMemoryRow);
  });
}

/**
 * 关键字搜索：通过 pg_trgm 子串相似度搜索记忆内容。
 * 与 recallMemory 互补：向量召回靠语义，trigram 召回靠精确 ticker/数字/术语。
 * 结果按 similarity × strength 排序。
 */
export async function searchMemoriesByKeyword(
  keyword: string,
  opts: { limit?: number; minSimilarity?: number } = {},
): Promise<AgentMemory[]> {
  const limit = opts.limit ?? 10;
  const minSim = opts.minSimilarity ?? 0.1;
  const kw = keyword.trim();
  if (!kw) return [];
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    try {
      const res = await query(
        `SELECT *, similarity(content, $1) AS sim
         FROM daa_agent_memory
         WHERE owner_account_id = $3 AND content % $1 AND strength >= 0.05
         ORDER BY sim * strength DESC
         LIMIT $2`,
        [kw, limit, ownerAccountId],
      );
      return res.rows
        .filter(r => Number(r.sim ?? 0) >= minSim)
        .map(mapMemoryRow);
    } catch (e) {
      // pg_trgm 未安装时降级到 ILIKE
      logSwallowed("memoryStore.trgmSearch", e);
      const res = await query(
        `SELECT * FROM daa_agent_memory
         WHERE owner_account_id = $3 AND content ILIKE $1 AND strength >= 0.05
         ORDER BY strength DESC
         LIMIT $2`,
        [`%${kw}%`, limit, ownerAccountId],
      );
      return res.rows.map(mapMemoryRow);
    }
  });
}

/**
 * 混合召回：向量 + 关键字并行，合并去重后返回。
 * 向量优先（保留 top vectorLimit），关键字补位直到 totalLimit。
 */
export async function recallMemoryHybrid(opts: {
  queryEmbedding?: number[];
  keywords?: string[];
  tags?: string[];
  vectorLimit?: number;
  totalLimit?: number;
}): Promise<AgentMemory[]> {
  const totalLimit = opts.totalLimit ?? 5;
  const vectorLimit = opts.vectorLimit ?? totalLimit;

  const [vectorHits, keywordHits] = await Promise.all([
    recallMemory({
      queryEmbedding: opts.queryEmbedding,
      tags: opts.tags,
      limit: vectorLimit,
    }),
    (opts.keywords && opts.keywords.length > 0)
      ? Promise.all(opts.keywords.map(k => searchMemoriesByKeyword(k, { limit: totalLimit })))
          .then(arr => arr.flat())
      : Promise.resolve<AgentMemory[]>([]),
  ]);

  // 合并去重（向量优先）
  const merged = new Map<string, AgentMemory>();
  for (const m of vectorHits) merged.set(m.id, m);
  for (const m of keywordHits) {
    if (merged.size >= totalLimit) break;
    if (!merged.has(m.id)) merged.set(m.id, m);
  }
  return Array.from(merged.values()).slice(0, totalLimit);
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
  const ownerAccountId = getDaaAccountScopeId();

  return withDaaPgClient(async ({ query }) => {
    const conditions = opts.type ? "WHERE owner_account_id = $1 AND memory_type = $2" : "WHERE owner_account_id = $1";
    const params: unknown[] = opts.type ? [ownerAccountId, opts.type] : [ownerAccountId];

    const countRes = await query(
      `SELECT COUNT(*) as cnt FROM daa_agent_memory ${conditions}`,
      params,
    );
    const total = Number(countRes.rows[0]?.cnt ?? 0);

    const dataParams = opts.type ? [ownerAccountId, opts.type, limit, offset] : [ownerAccountId, limit, offset];
    const limitIdx = opts.type ? "$3" : "$2";
    const offsetIdx = opts.type ? "$4" : "$3";

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
  const ownerAccountId = getDaaAccountScopeId();
  await withDaaPgClient(async ({ query }) => {
    await query(`DELETE FROM daa_agent_memory WHERE owner_account_id = $1 AND id = $2`, [ownerAccountId, id]);
  });
}

/**
 * Feature E: 批量衰减记忆强度。
 * 公式: new_strength = strength × decayRate^(days_since_last_access)
 * 只处理 last_accessed > 1 天前且 strength > 0.01 的记忆。
 */
export async function applyMemoryDecay(decayRate: number = 0.97): Promise<number> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    // 2A: 先硬删除僵尸记忆（strength < 0.01 且 30 天未访问）
    await query(
      `DELETE FROM daa_agent_memory
       WHERE owner_account_id = $1 AND strength < 0.01 AND last_accessed < NOW() - INTERVAL '30 days'`,
      [ownerAccountId],
    ).catch(e => logSwallowed("memoryStore.zombieCleanup", e));

    // 衰减仍活跃的记忆
    const res = await query(
      `UPDATE daa_agent_memory
       SET strength = strength * POWER($1, EXTRACT(EPOCH FROM (NOW() - last_accessed)) / 86400)
       WHERE owner_account_id = $2
         AND last_accessed < NOW() - INTERVAL '1 day'
         AND strength > 0.01
       RETURNING id`,
      [decayRate, ownerAccountId],
    );
    return res.rows.length;
  });
}

export async function countMemories(): Promise<number> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT COUNT(*) as cnt FROM daa_agent_memory WHERE owner_account_id = $1`, [ownerAccountId]);
    return Number(res.rows[0]?.cnt ?? 0);
  });
}
