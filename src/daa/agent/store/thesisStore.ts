/**
 * Thesis Store — 研究线索 + 证据链的持久化层
 */

import { randomUUID } from "node:crypto";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import type {
  ResearchThread,
  EvidenceItem,
  EvidenceType,
  EvidenceSource,
  ThesisConviction,
  ThesisStatus,
} from "@/src/daa/agent/cognitiveTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── Row mappers ──

function mapThreadRow(r: Record<string, unknown>): ResearchThread {
  return {
    id: String(r.id),
    title: String(r.title),
    status: String(r.status) as ThesisStatus,
    thesisText: String(r.thesis_text),
    conviction: String(r.conviction) as ThesisConviction,
    invalidationConditions: r.invalidation_conditions ? String(r.invalidation_conditions) : null,
    reviewAt: r.review_at ? String(r.review_at) : null,
    assetKeys: Array.isArray(r.asset_keys) ? (r.asset_keys as string[]) : [],
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    priorityScore: Number(r.priority_score ?? 0.5),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapEvidenceRow(r: Record<string, unknown>): EvidenceItem {
  return {
    id: String(r.id),
    threadId: String(r.thread_id),
    evidenceType: String(r.evidence_type) as EvidenceType,
    source: String(r.source) as EvidenceSource,
    content: String(r.content),
    dataSnapshot: r.data_snapshot && typeof r.data_snapshot === "object"
      ? (r.data_snapshot as Record<string, unknown>)
      : null,
    confidence: Number(r.confidence ?? 0.5),
    createdAt: String(r.created_at),
  };
}

// ── CRUD ──

export async function createResearchThread(data: {
  title: string;
  thesisText: string;
  conviction?: ThesisConviction;
  invalidationConditions?: string;
  reviewAt?: Date;
  assetKeys?: string[];
  tags?: string[];
}): Promise<ResearchThread> {
  const created = await withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const res = await query(
      `INSERT INTO daa_research_threads (id, title, thesis_text, conviction, invalidation_conditions, review_at, asset_keys, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        data.title,
        data.thesisText,
        data.conviction ?? "medium",
        data.invalidationConditions ?? null,
        data.reviewAt ?? null,
        data.assetKeys ?? [],
        data.tags ?? [],
      ],
    );
    return mapThreadRow(res.rows[0]);
  });

  // 实体图：为新 thesis 自动抽取并链接实体（失败不影响主流程）
  try {
    const { extractEntitiesFromThesis } = await import("@/src/daa/agent/entities/entityExtractor");
    const { upsertAndLinkForThesis } = await import("@/src/daa/agent/entities/entityStore");
    const entities = extractEntitiesFromThesis(created);
    await upsertAndLinkForThesis(created.id, entities);
  } catch (e) {
    logSwallowed("thesisStore.createResearchThread.entityLink", e);
  }

  return created;
}

export async function getActiveTheses(): Promise<ResearchThread[]> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_research_threads WHERE status = 'active' ORDER BY priority_score DESC, updated_at DESC`,
    );
    return res.rows.map(mapThreadRow);
  });
}

/**
 * 归档超过 staleDays 天未更新的 uncertain thesis。
 * prioritizeNode 会为驱动调查创建 conviction=uncertain 的临时 thesis，如果长时间没被 investigate 节点转正，
 * 它们会在冲突检测、认知缺口等下游产生噪声。此函数在每次 observe 时清扫一次。
 * 返回归档的 thesis id 列表，便于日志观察。
 */
export async function archiveStaleUncertainTheses(staleDays = 7): Promise<string[]> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query<{ id: string }>(
      `UPDATE daa_research_threads
       SET status = 'archived', updated_at = now()
       WHERE status = 'active'
         AND conviction = 'uncertain'
         AND updated_at < now() - (interval '1 day' * $1)
       RETURNING id`,
      [staleDays],
    );
    return res.rows.map(r => r.id);
  });
}

export async function getThesisById(id: string): Promise<ResearchThread | null> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT * FROM daa_research_threads WHERE id = $1`, [id]);
    return res.rows[0] ? mapThreadRow(res.rows[0]) : null;
  });
}

export async function getThesisWithEvidence(id: string): Promise<{ thread: ResearchThread; evidence: EvidenceItem[] } | null> {
  return withDaaPgClient(async ({ query }) => {
    const threadRes = await query(`SELECT * FROM daa_research_threads WHERE id = $1`, [id]);
    if (!threadRes.rows[0]) return null;
    const evidenceRes = await query(
      `SELECT * FROM daa_evidence_items WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id],
    );
    return {
      thread: mapThreadRow(threadRes.rows[0]),
      evidence: evidenceRes.rows.map(mapEvidenceRow),
    };
  });
}

export async function updateThesis(
  id: string,
  patch: {
    thesisText?: string;
    conviction?: ThesisConviction;
    invalidationConditions?: string;
    reviewAt?: Date | null;
    status?: ThesisStatus;
    priorityScore?: number;
  },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (patch.thesisText !== undefined) { sets.push(`thesis_text = $${idx++}`); vals.push(patch.thesisText); }
  if (patch.conviction !== undefined) { sets.push(`conviction = $${idx++}`); vals.push(patch.conviction); }
  if (patch.invalidationConditions !== undefined) { sets.push(`invalidation_conditions = $${idx++}`); vals.push(patch.invalidationConditions); }
  if (patch.reviewAt !== undefined) { sets.push(`review_at = $${idx++}`); vals.push(patch.reviewAt); }
  if (patch.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(patch.status); }
  if (patch.priorityScore !== undefined) { sets.push(`priority_score = $${idx++}`); vals.push(patch.priorityScore); }

  if (sets.length === 0) return;
  sets.push(`updated_at = now()`);
  vals.push(id);

  await withDaaPgClient(async ({ query }) => {
    await query(`UPDATE daa_research_threads SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
  });
}

export async function addEvidence(data: {
  threadId: string;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  content: string;
  dataSnapshot?: Record<string, unknown>;
  confidence?: number;
}): Promise<EvidenceItem> {
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const res = await query(
      `INSERT INTO daa_evidence_items (id, thread_id, evidence_type, source, content, data_snapshot, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, data.threadId, data.evidenceType, data.source, data.content, data.dataSnapshot ? JSON.stringify(data.dataSnapshot) : null, data.confidence ?? 0.5],
    );
    return mapEvidenceRow(res.rows[0]);
  });
}

export async function getDueReviews(): Promise<ResearchThread[]> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_research_threads WHERE status = 'active' AND review_at IS NOT NULL AND review_at <= now() ORDER BY review_at ASC`,
    );
    return res.rows.map(mapThreadRow);
  });
}

export async function createThesisReview(data: {
  threadId: string;
  reviewWindow: string;
  thesisAtTime: string;
  convictionAtTime: string;
  actualOutcome: string;
  accuracyScore: number;
  lessonsLearned: string | null;
}): Promise<void> {
  await withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    await query(
      `INSERT INTO daa_thesis_reviews (id, thread_id, review_window, thesis_at_time, conviction_at_time, actual_outcome, accuracy_score, lessons_learned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, data.threadId, data.reviewWindow, data.thesisAtTime, data.convictionAtTime, data.actualOutcome, data.accuracyScore, data.lessonsLearned],
    );
  });
}

/**
 * P2-9: 查找与给定 assetKeys 和标题相似的已有活跃 thesis。
 * 用于去重：同一资产组合且标题有 substring 重叠时视为重复。
 */
export async function findSimilarThesis(assetKeys: string[], title: string): Promise<ResearchThread | null> {
  if (assetKeys.length === 0) return null;
  return withDaaPgClient(async ({ query }) => {
    // 查找同一 assetKeys 且 status=active 的 thesis
    const res = await query(
      `SELECT * FROM daa_research_threads
       WHERE status = 'active' AND asset_keys && $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [assetKeys],
    );
    if (res.rows.length === 0) return null;

    // 简单标题相似度：任一方标题是另一方的子串
    const titleLower = title.toLowerCase();
    for (const row of res.rows) {
      const existingTitle = String(row.title).toLowerCase();
      if (titleLower.includes(existingTitle) || existingTitle.includes(titleLower)) {
        return mapThreadRow(row);
      }
    }
    return null;
  });
}

/**
 * 查询某 thesis 的所有复盘记录（按时间倒序）。
 */
export async function getReviewsByThreadId(threadId: string): Promise<Array<{
  id: string;
  threadId: string;
  reviewWindow: string;
  thesisAtTime: string;
  convictionAtTime: string;
  actualOutcome: string | null;
  accuracyScore: number | null;
  lessonsLearned: string | null;
  createdAt: string;
}>> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_thesis_reviews WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [threadId],
    );
    return res.rows.map(r => ({
      id: String(r.id),
      threadId: String(r.thread_id),
      reviewWindow: String(r.review_window),
      thesisAtTime: String(r.thesis_at_time),
      convictionAtTime: String(r.conviction_at_time),
      actualOutcome: r.actual_outcome ? String(r.actual_outcome) : null,
      accuracyScore: r.accuracy_score != null ? Number(r.accuracy_score) : null,
      lessonsLearned: r.lessons_learned ? String(r.lessons_learned) : null,
      createdAt: String(r.created_at),
    }));
  });
}

/**
 * 关键字搜索证据链条（跨论点）。
 * 用于 Agent 自查"我之前在哪里推理过 XX"，pg_trgm 子串匹配。
 */
export async function searchEvidenceByKeyword(
  keyword: string,
  opts: { limit?: number; minSimilarity?: number } = {},
): Promise<Array<EvidenceItem & { threadId: string; threadTitle: string }>> {
  const limit = opts.limit ?? 10;
  const minSim = opts.minSimilarity ?? 0.1;
  const kw = keyword.trim();
  if (!kw) return [];
  return withDaaPgClient(async ({ query }) => {
    try {
      const res = await query(
        `SELECT e.*, t.title AS thread_title, similarity(e.content, $1) AS sim
         FROM daa_evidence_items e
         JOIN daa_research_threads t ON t.id = e.thread_id
         WHERE e.content % $1
         ORDER BY sim DESC, e.created_at DESC
         LIMIT $2`,
        [kw, limit],
      );
      return res.rows
        .filter(r => Number(r.sim ?? 0) >= minSim)
        .map(r => ({
          ...mapEvidenceRow(r),
          threadId: String(r.thread_id),
          threadTitle: String(r.thread_title ?? ""),
        }));
    } catch (e) {
      logSwallowed("thesisStore.searchEvidenceTrgm", e);
      const res = await query(
        `SELECT e.*, t.title AS thread_title
         FROM daa_evidence_items e
         JOIN daa_research_threads t ON t.id = e.thread_id
         WHERE e.content ILIKE $1
         ORDER BY e.created_at DESC
         LIMIT $2`,
        [`%${kw}%`, limit],
      );
      return res.rows.map(r => ({
        ...mapEvidenceRow(r),
        threadId: String(r.thread_id),
        threadTitle: String(r.thread_title ?? ""),
      }));
    }
  });
}

export async function countThreads(): Promise<number> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT COUNT(*) as cnt FROM daa_research_threads`);
    return Number(res.rows[0]?.cnt ?? 0);
  });
}

/**
 * 获取指定 thesis 的历史复盘准确率加权平均。
 * @returns 0~1 的准确率，null 表示无复盘记录
 */
export async function getThesisAccuracyAvg(threadId: string): Promise<number | null> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT AVG(accuracy_score) as avg_score
       FROM daa_thesis_reviews
       WHERE thread_id = $1 AND accuracy_score IS NOT NULL`,
      [threadId],
    );
    const val = res.rows[0]?.avg_score;
    if (val === null || val === undefined) return null;
    return Number(val);
  });
}
