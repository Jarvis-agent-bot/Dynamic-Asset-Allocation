/**
 * Thesis Store — 研究线索 + 证据链的持久化层
 */

import { randomUUID } from "node:crypto";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import type {
  ResearchThread,
  EvidenceItem,
  EvidenceType,
  EvidenceSource,
  ThesisConviction,
  ThesisReviewStatus,
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
    lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null,
    lastInvestigatedAt: r.last_investigated_at ? String(r.last_investigated_at) : null,
    lastEvidenceAt: r.last_evidence_at ? String(r.last_evidence_at) : null,
    lastDecisionAt: r.last_decision_at ? String(r.last_decision_at) : null,
    reviewStatus: String(r.review_status ?? "pending") as ThesisReviewStatus,
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
  const ownerAccountId = getDaaAccountScopeId();
  const created = await withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const res = await query(
      `INSERT INTO daa_research_threads (owner_account_id, id, title, thesis_text, conviction, invalidation_conditions, review_at, asset_keys, tags, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING *`,
      [
        ownerAccountId,
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
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_research_threads WHERE owner_account_id = $1 AND status = 'active' ORDER BY priority_score DESC, updated_at DESC`,
      [ownerAccountId],
    );
    return res.rows.map(mapThreadRow);
  });
}

/**
 * 归档超过 staleDays 天未更新的 uncertain thesis。
 * prioritizeNode 会为驱动调查创建 conviction=uncertain 的待确认 thesis，如果长时间没被 investigate 节点转正，
 * 它们会在冲突检测、论点复核清单等下游产生噪声。此函数在每次 observe 时清扫一次。
 * 返回归档的 thesis id 列表，便于日志观察。
 */
export async function archiveStaleUncertainTheses(staleDays = 7, protectedAssetKeys: string[] = []): Promise<string[]> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const protectedKeys = protectedAssetKeys
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    const res = await query<{ id: string }>(
      `UPDATE daa_research_threads
       SET status = 'archived', updated_at = now()
       WHERE owner_account_id = $3
         AND status = 'active'
         AND conviction = 'uncertain'
         AND updated_at < now() - (interval '1 day' * $1)
         AND (cardinality($2::text[]) = 0 OR NOT (asset_keys && $2::text[]))
       RETURNING id`,
      [staleDays, protectedKeys, ownerAccountId],
    );
    return res.rows.map(r => r.id);
  });
}

export async function getThesisById(id: string): Promise<ResearchThread | null> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT * FROM daa_research_threads WHERE owner_account_id = $1 AND id = $2`, [ownerAccountId, id]);
    return res.rows[0] ? mapThreadRow(res.rows[0]) : null;
  });
}

export async function getThesisWithEvidence(id: string): Promise<{ thread: ResearchThread; evidence: EvidenceItem[] } | null> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const threadRes = await query(`SELECT * FROM daa_research_threads WHERE owner_account_id = $1 AND id = $2`, [ownerAccountId, id]);
    if (!threadRes.rows[0]) return null;
    const evidenceRes = await query(
      `SELECT * FROM daa_evidence_items WHERE owner_account_id = $1 AND thread_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [ownerAccountId, id],
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
  const ownerAccountId = getDaaAccountScopeId();
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
    vals.push(ownerAccountId);
    await query(`UPDATE daa_research_threads SET ${sets.join(", ")} WHERE id = $${idx} AND owner_account_id = $${idx + 1}`, vals);
  });
}

/**
 * 只刷新 updated_at，不改其他字段。
 * 供 investigateNode 在"调查完成但 thesis 未变化"时使用，避免
 * 论点复核天数永远增长的 bug（medium thesis 被调查后仍显示 N 天未调查）。
 */
export async function touchThesis(id: string): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  await withDaaPgClient(async ({ query }) => {
    await query(
      `UPDATE daa_research_threads
       SET updated_at = now(),
           last_investigated_at = now(),
           review_status = 'resolved'
       WHERE owner_account_id = $1 AND id = $2`,
      [ownerAccountId, id],
    );
  });
}

export async function markThesesSeen(threadIds: string[]): Promise<number> {
  const ownerAccountId = getDaaAccountScopeId();
  const ids = Array.from(new Set(threadIds.map((id) => String(id || "").trim()).filter(Boolean))).slice(0, 50);
  if (ids.length === 0) return 0;
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `UPDATE daa_research_threads
       SET last_seen_at = now()
       WHERE owner_account_id = $1
         AND id = ANY($2::text[])
       RETURNING id`,
      [ownerAccountId, ids],
    );
    return res.rows.length;
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
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    const res = await query(
      `INSERT INTO daa_evidence_items (owner_account_id, id, thread_id, evidence_type, source, content, data_snapshot, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [ownerAccountId, id, data.threadId, data.evidenceType, data.source, data.content, data.dataSnapshot ? JSON.stringify(data.dataSnapshot) : null, data.confidence ?? 0.5],
    );
    await query(
      `UPDATE daa_research_threads
       SET last_evidence_at = now(),
           review_status = CASE WHEN review_status = 'snoozed' THEN review_status ELSE 'resolved' END
       WHERE owner_account_id = $1 AND id = $2`,
      [ownerAccountId, data.threadId],
    );
    return mapEvidenceRow(res.rows[0]);
  });
}

export async function getDueReviews(): Promise<ResearchThread[]> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_research_threads WHERE owner_account_id = $1 AND status = 'active' AND review_at IS NOT NULL AND review_at <= now() ORDER BY review_at ASC`,
      [ownerAccountId],
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
  const ownerAccountId = getDaaAccountScopeId();
  await withDaaPgClient(async ({ query }) => {
    const id = randomUUID();
    await query(
      `INSERT INTO daa_thesis_reviews (owner_account_id, id, thread_id, review_window, thesis_at_time, conviction_at_time, actual_outcome, accuracy_score, lessons_learned)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ownerAccountId, id, data.threadId, data.reviewWindow, data.thesisAtTime, data.convictionAtTime, data.actualOutcome, data.accuracyScore, data.lessonsLearned],
    );
  });
}

/**
 * P2-9: 查找与给定 assetKeys 和标题相似的已有活跃 thesis。
 * 用于去重：同一资产组合，且标题 pg_trgm 相似度 >= 0.40 视为重复。
 * 0.40 阈值经验值——足以捕获"NVDA AI 突破"vs"NVDA AI 估值修复"这类同主题
 * 不同措辞的论点，又不会把"NVDA 估值过高"vs"NVDA 看多 AI"误判为同一篇。
 */
export async function findSimilarThesis(assetKeys: string[], title: string): Promise<ResearchThread | null> {
  if (assetKeys.length === 0 || !title.trim()) return null;
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT *, similarity(title, $3) AS sim
       FROM daa_research_threads
       WHERE owner_account_id = $2 AND status = 'active' AND asset_keys && $1
         AND similarity(title, $3) >= 0.40
       ORDER BY sim DESC, updated_at DESC
       LIMIT 1`,
      [assetKeys, ownerAccountId, title],
    );
    if (res.rows.length === 0) return null;
    return mapThreadRow(res.rows[0]);
  });
}

/**
 * 统计某资产的活跃 thesis 数量。
 * prioritize 节点用于阻止单资产论点数量失控（默认上限 5 篇）。
 */
export async function countActiveThesesForAssets(assetKeys: string[]): Promise<number> {
  if (assetKeys.length === 0) return 0;
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT COUNT(*)::int AS c FROM daa_research_threads
       WHERE owner_account_id = $2 AND status = 'active' AND asset_keys && $1`,
      [assetKeys, ownerAccountId],
    );
    return Number(res.rows[0]?.c ?? 0);
  });
}

/**
 * 获取某资产相关的所有活跃 thesis（按 updated_at 倒序）。
 * 用于 /portfolio/[assetKey] 页展示该资产的 Agent 观点。
 */
export async function getThesesByAssetKey(assetKey: string): Promise<ResearchThread[]> {
  const key = String(assetKey || "").trim();
  if (!key) return [];
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_research_threads
       WHERE owner_account_id = $2 AND status = 'active' AND asset_keys && $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [[key], ownerAccountId],
    );
    return res.rows.map(mapThreadRow);
  });
}

/**
 * 获取一组 thesis 各自的最新 N 条证据（按 thesis id 分组返回）。
 * 用于资产详情页一次性加载多个 thesis 的最近证据。
 */
export async function getLatestEvidenceByThreadIds(
  threadIds: string[],
  perThreadLimit = 3,
): Promise<Map<string, EvidenceItem[]>> {
  if (threadIds.length === 0) return new Map();
  const limit = Math.max(1, Math.min(10, perThreadLimit));
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query<{
      id: string;
      thread_id: string;
      evidence_type: string;
      source: string;
      content: string;
      data_snapshot: Record<string, unknown> | null;
      confidence: number | string | null;
      created_at: string;
      row_num: string | number;
    }>(
      `SELECT id, thread_id, evidence_type, source, content, data_snapshot, confidence, created_at, row_num
       FROM (
         SELECT id, thread_id, evidence_type, source, content, data_snapshot, confidence, created_at,
                ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC) AS row_num
         FROM daa_evidence_items
         WHERE owner_account_id = $3 AND thread_id = ANY($1::text[])
       ) t
       WHERE row_num <= $2
       ORDER BY thread_id, created_at DESC`,
      [threadIds, limit, ownerAccountId],
    );
    const grouped = new Map<string, EvidenceItem[]>();
    for (const row of res.rows) {
      const list = grouped.get(row.thread_id) ?? [];
      list.push({
        id: row.id,
        threadId: row.thread_id,
        evidenceType: row.evidence_type as EvidenceItem["evidenceType"],
        source: row.source as EvidenceItem["source"],
        content: row.content,
        dataSnapshot: row.data_snapshot,
        confidence: Number(row.confidence ?? 0) || 0,
        createdAt: String(row.created_at),
      });
      grouped.set(row.thread_id, list);
    }
    return grouped;
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
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT * FROM daa_thesis_reviews WHERE owner_account_id = $1 AND thread_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [ownerAccountId, threadId],
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
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    try {
      const res = await query(
        `SELECT e.*, t.title AS thread_title, similarity(e.content, $1) AS sim
         FROM daa_evidence_items e
         JOIN daa_research_threads t ON t.id = e.thread_id
         WHERE e.owner_account_id = $3 AND t.owner_account_id = $3 AND e.content % $1
         ORDER BY sim DESC, e.created_at DESC
         LIMIT $2`,
        [kw, limit, ownerAccountId],
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
         WHERE e.owner_account_id = $3 AND t.owner_account_id = $3 AND e.content ILIKE $1
         ORDER BY e.created_at DESC
         LIMIT $2`,
        [`%${kw}%`, limit, ownerAccountId],
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
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(`SELECT COUNT(*) as cnt FROM daa_research_threads WHERE owner_account_id = $1`, [ownerAccountId]);
    return Number(res.rows[0]?.cnt ?? 0);
  });
}

/**
 * 获取指定 thesis 的历史复盘准确率加权平均。
 * @returns 0~1 的准确率，null 表示无复盘记录
 */
export async function getThesisAccuracyAvg(threadId: string): Promise<number | null> {
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const res = await query(
      `SELECT AVG(accuracy_score) as avg_score
       FROM daa_thesis_reviews
       WHERE owner_account_id = $1 AND thread_id = $2 AND accuracy_score IS NOT NULL`,
      [ownerAccountId, threadId],
    );
    const val = res.rows[0]?.avg_score;
    if (val === null || val === undefined) return null;
    return Number(val);
  });
}
