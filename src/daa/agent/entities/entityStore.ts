/**
 * Entity Store — 实体图持久化层
 *
 * 表：daa_agent_entity + daa_memory_entity_link + daa_thesis_entity_link
 * 用于跨资产/跨论点的因果关联查询，和 pgvector 语义召回互补。
 */

import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import type { EntityKind, ExtractedEntity } from "@/src/daa/agent/entities/entityExtractor";
import type { AgentMemory, ResearchThread } from "@/src/daa/agent/cognitiveTypes";

interface AgentEntity {
  id: string;
  kind: EntityKind;
  value: string;
  displayName: string | null;
  mentionCount: number;
  firstSeen: string;
  lastSeen: string;
}

function mapEntityRow(r: Record<string, unknown>): AgentEntity {
  return {
    id: String(r.id),
    kind: String(r.kind) as EntityKind,
    value: String(r.value),
    displayName: r.display_name ? String(r.display_name) : null,
    mentionCount: Number(r.mention_count ?? 1),
    firstSeen: String(r.first_seen),
    lastSeen: String(r.last_seen),
  };
}

/**
 * Upsert 实体；存在则累加 mention_count 并刷新 last_seen。
 * 返回 entity id。
 */
async function upsertEntity(
  entity: ExtractedEntity,
): Promise<string> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query<{ id: string }>(
      `INSERT INTO daa_agent_entity (kind, value, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (kind, value) DO UPDATE SET
         mention_count = daa_agent_entity.mention_count + 1,
         last_seen = now(),
         display_name = COALESCE(EXCLUDED.display_name, daa_agent_entity.display_name)
       RETURNING id`,
      [entity.kind, entity.value, entity.displayName ?? null],
    );
    return res.rows[0]!.id;
  });
}

async function upsertEntitiesBulk(entities: ExtractedEntity[]): Promise<string[]> {
  if (entities.length === 0) return [];
  const ids: string[] = [];
  for (const e of entities) {
    try {
      ids.push(await upsertEntity(e));
    } catch (err) {
      logSwallowed("entityStore.upsertEntity", err);
    }
  }
  return ids;
}

async function linkMemoryToEntities(memoryId: string, entityIds: string[]): Promise<void> {
  if (entityIds.length === 0) return;
  await withDaaPgClient(async ({ query }) => {
    for (const eid of entityIds) {
      await query(
        `INSERT INTO daa_memory_entity_link (memory_id, entity_id)
         VALUES ($1, $2)
         ON CONFLICT (memory_id, entity_id) DO UPDATE SET weight = daa_memory_entity_link.weight + 0.1`,
        [memoryId, eid],
      ).catch(e => logSwallowed("entityStore.linkMemory", e));
    }
  });
}

async function linkThesisToEntities(thesisId: string, entityIds: string[]): Promise<void> {
  if (entityIds.length === 0) return;
  await withDaaPgClient(async ({ query }) => {
    for (const eid of entityIds) {
      await query(
        `INSERT INTO daa_thesis_entity_link (thesis_id, entity_id)
         VALUES ($1, $2)
         ON CONFLICT (thesis_id, entity_id) DO UPDATE SET weight = daa_thesis_entity_link.weight + 0.1`,
        [thesisId, eid],
      ).catch(e => logSwallowed("entityStore.linkThesis", e));
    }
  });
}

/**
 * 给定一批 ExtractedEntity，一次性做 upsert + link（原子性最佳努力）。
 */
export async function upsertAndLinkForMemory(
  memoryId: string,
  entities: ExtractedEntity[],
): Promise<number> {
  const ids = await upsertEntitiesBulk(entities);
  await linkMemoryToEntities(memoryId, ids);
  return ids.length;
}

export async function upsertAndLinkForThesis(
  thesisId: string,
  entities: ExtractedEntity[],
): Promise<number> {
  const ids = await upsertEntitiesBulk(entities);
  await linkThesisToEntities(thesisId, ids);
  return ids.length;
}

// ── 查询 ──

export async function findEntity(kind: EntityKind, value: string): Promise<AgentEntity | null> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_agent_entity WHERE kind = $1 AND value = $2 LIMIT 1`,
      [kind, value],
    );
    return res.rows[0] ? mapEntityRow(res.rows[0]) : null;
  });
}

/**
 * 获取指定实体关联的记忆（按 link weight × memory strength 排序）。
 */
export async function getMemoriesByEntity(
  kind: EntityKind,
  value: string,
  limit = 10,
): Promise<Array<AgentMemory & { linkWeight: number }>> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT m.*, l.weight AS link_weight
       FROM daa_memory_entity_link l
       JOIN daa_agent_entity e ON e.id = l.entity_id
       JOIN daa_agent_memory m ON m.id = l.memory_id
       WHERE e.kind = $1 AND e.value = $2 AND m.owner_account_id = $4 AND m.strength >= 0.05
       ORDER BY l.weight * m.strength DESC, m.last_accessed DESC
       LIMIT $3`,
      [kind, value, limit, ownerAccountId],
    );
    return res.rows.map(r => ({
      id: String(r.id),
      memoryType: String(r.memory_type) as AgentMemory["memoryType"],
      content: String(r.content),
      sourceRunIds: Array.isArray(r.source_run_ids) ? (r.source_run_ids as string[]) : [],
      relevanceTags: Array.isArray(r.relevance_tags) ? (r.relevance_tags as string[]) : [],
      embedding: null,
      strength: Number(r.strength ?? 1),
      createdAt: String(r.created_at),
      lastAccessed: String(r.last_accessed),
      linkWeight: Number(r.link_weight ?? 1),
    }));
  });
}

/**
 * 获取指定实体关联的论点。
 */
export async function getThesesByEntity(
  kind: EntityKind,
  value: string,
  limit = 10,
): Promise<Array<Pick<ResearchThread, "id" | "title" | "conviction" | "status" | "assetKeys" | "updatedAt"> & { linkWeight: number }>> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT t.id, t.title, t.conviction, t.status, t.asset_keys, t.updated_at, l.weight AS link_weight
       FROM daa_thesis_entity_link l
       JOIN daa_agent_entity e ON e.id = l.entity_id
       JOIN daa_research_threads t ON t.id = l.thesis_id
       WHERE e.kind = $1 AND e.value = $2 AND t.owner_account_id = $4
       ORDER BY l.weight DESC, t.updated_at DESC
       LIMIT $3`,
      [kind, value, limit, ownerAccountId],
    );
    return res.rows.map(r => ({
      id: String(r.id),
      title: String(r.title),
      conviction: String(r.conviction) as ResearchThread["conviction"],
      status: String(r.status) as ResearchThread["status"],
      assetKeys: Array.isArray(r.asset_keys) ? (r.asset_keys as string[]) : [],
      updatedAt: String(r.updated_at),
      linkWeight: Number(r.link_weight ?? 1),
    }));
  });
}

/**
 * 协同出现的实体：与 (kind, value) 共同出现在同一 memory/thesis 中的其他实体。
 */
export async function getCoMentionedEntities(
  kind: EntityKind,
  value: string,
  limit = 10,
): Promise<Array<AgentEntity & { coCount: number }>> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `WITH target AS (
         SELECT id FROM daa_agent_entity WHERE kind = $1 AND value = $2
       ),
       co AS (
         SELECT l2.entity_id AS co_id, COUNT(*) AS cnt
         FROM daa_memory_entity_link l1
         JOIN daa_memory_entity_link l2 ON l1.memory_id = l2.memory_id AND l1.entity_id <> l2.entity_id
         JOIN daa_agent_memory m ON m.id = l1.memory_id
         WHERE l1.entity_id IN (SELECT id FROM target)
           AND m.owner_account_id = $4
         GROUP BY l2.entity_id
         UNION ALL
         SELECT l2.entity_id AS co_id, COUNT(*) AS cnt
         FROM daa_thesis_entity_link l1
         JOIN daa_thesis_entity_link l2 ON l1.thesis_id = l2.thesis_id AND l1.entity_id <> l2.entity_id
         JOIN daa_research_threads t ON t.id = l1.thesis_id
         WHERE l1.entity_id IN (SELECT id FROM target)
           AND t.owner_account_id = $4
         GROUP BY l2.entity_id
       ),
       agg AS (
         SELECT co_id, SUM(cnt) AS total
         FROM co
         GROUP BY co_id
         ORDER BY total DESC
         LIMIT $3
       )
       SELECT e.*, agg.total AS co_count
       FROM agg
       JOIN daa_agent_entity e ON e.id = agg.co_id
       ORDER BY agg.total DESC`,
      [kind, value, limit, ownerAccountId],
    );
    return res.rows.map(r => ({
      ...mapEntityRow(r),
      coCount: Number(r.co_count ?? 0),
    }));
  });
}
