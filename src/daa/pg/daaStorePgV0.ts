import type {
  DaaRunAuditEventListRowV0,
  DaaRunAuditEventV0,
  DaaRunBundleV0,
  DaaRunListRowV0,
  DaaRunRowV0,
} from "../storeTypesV0";

import { withDaaPgClientV0 } from "./daaPgV0";

type StorePgStateV0 = {
  schemaInit: Promise<void> | null;
  lastAuditCleanupAtMs: number;
  auditCleanupPromise: Promise<void> | null;
};

const GLOBAL_KEY = "__daa_store_pg_state_v0__";

function getStateV0(): StorePgStateV0 {
  const g: any = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      schemaInit: null,
      lastAuditCleanupAtMs: 0,
      auditCleanupPromise: null,
    } satisfies StorePgStateV0;
  }
  return g[GLOBAL_KEY] as StorePgStateV0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === "function") return `${prefix}_${String(c.randomUUID())}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonStringify(x: unknown): string {
  try {
    return JSON.stringify(x);
  } catch {
    throw new Error("payload is not JSON-serializable");
  }
}

function coerceJson(v: unknown): unknown {
  if (v && typeof v === "object") return v;
  if (typeof v === "string" && v) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function deriveRunActorSourceV0(args: { kind: string; payload: unknown }): { actor: string; source: string } {
  const kind = String(args.kind ?? "").trim();

  let source = "";
  let actor = "";

  const p: any = args.payload as any;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    source = String(p.source ?? "").trim();
    actor = String(p.actor ?? "").trim();
  }

  if (!actor) {
    const sourceLower = source.toLowerCase();
    const kindLower = kind.toLowerCase();

    if (sourceLower.includes("/daa/dashboard") || kindLower.includes("dashboard")) actor = "dashboard";
    else if (sourceLower.includes("/daa/market/funds") || kindLower.includes("market-funds")) actor = "market-funds";
    else actor = "unknown";
  }

  return { actor, source };
}

function parsePositiveIntEnvV0(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const t = Math.trunc(n);
  return t > 0 ? t : 0;
}

function retentionCutoffIsoV0(retentionDays: number): string {
  const now = Date.now();
  const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000;
  return new Date(cutoffMs).toISOString();
}

async function runAuditRetentionCleanupPgV0(): Promise<void> {
  const retentionDays = parsePositiveIntEnvV0("DAA_STORE_AUDIT_RETENTION_DAYS", 0);
  if (retentionDays <= 0) return;

  const batchSize = parsePositiveIntEnvV0("DAA_STORE_AUDIT_RETENTION_DELETE_BATCH", 500);
  const cutoffIso = retentionCutoffIsoV0(retentionDays);
  const deleteLimit = Math.max(1, batchSize);

  await withDaaPgClientV0(async ({ query }) => {
    const rowsRes = await query(
      `
      SELECT run_id, event_id, created_at
      FROM daa_run_audit_events
      WHERE created_at < $1
      ORDER BY run_id ASC, created_at DESC, event_id DESC
      `,
      [cutoffIso],
    );

    const doomedEventIds: string[] = [];
    const seenRunIds = new Set<string>();

    for (const row of rowsRes.rows || []) {
      const runId = String((row as any).run_id ?? "").trim();
      const eventId = String((row as any).event_id ?? "").trim();
      if (!runId || !eventId) continue;

      if (!seenRunIds.has(runId)) {
        seenRunIds.add(runId);
        continue;
      }

      doomedEventIds.push(eventId);
      if (doomedEventIds.length >= deleteLimit) break;
    }

    for (const eventId of doomedEventIds) {
      await query("DELETE FROM daa_run_audit_events WHERE event_id = $1", [eventId]);
    }
  });
}

async function maybeCleanupAuditRetentionPgV0(): Promise<void> {
  const retentionDays = parsePositiveIntEnvV0("DAA_STORE_AUDIT_RETENTION_DAYS", 0);
  if (retentionDays <= 0) return;

  const state = getStateV0();
  const intervalMs = parsePositiveIntEnvV0("DAA_STORE_AUDIT_RETENTION_CLEANUP_INTERVAL_MS", 5 * 60 * 1000);
  const now = Date.now();

  if (state.auditCleanupPromise) {
    await state.auditCleanupPromise;
    return;
  }

  if (intervalMs > 0 && now - state.lastAuditCleanupAtMs < intervalMs) {
    return;
  }

  state.lastAuditCleanupAtMs = now;
  state.auditCleanupPromise = runAuditRetentionCleanupPgV0();

  try {
    await state.auditCleanupPromise;
  } catch {
    // Cleanup is best-effort and must never block store writes.
  } finally {
    state.auditCleanupPromise = null;
  }
}

export async function ensureDaaStoreSchemaPgV0(): Promise<void> {
  const st = getStateV0();
  st.schemaInit ||= withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_runs (
          run_id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          payload JSONB NOT NULL,
          actor TEXT NOT NULL DEFAULT 'unknown',
          source TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_daa_runs_created_at
          ON daa_runs(created_at);

        CREATE INDEX IF NOT EXISTS idx_daa_runs_created_at_desc
          ON daa_runs(created_at DESC, run_id DESC);

        CREATE INDEX IF NOT EXISTS idx_daa_runs_actor_created_at
          ON daa_runs(actor, created_at);

        CREATE INDEX IF NOT EXISTS idx_daa_runs_actor_created_at_desc
          ON daa_runs(actor, created_at DESC, run_id DESC);

        CREATE TABLE IF NOT EXISTS daa_run_portfolio (
          run_id TEXT PRIMARY KEY REFERENCES daa_runs(run_id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          payload JSONB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daa_run_confirm (
          run_id TEXT PRIMARY KEY REFERENCES daa_runs(run_id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          payload JSONB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daa_run_executed (
          run_id TEXT PRIMARY KEY REFERENCES daa_runs(run_id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          payload JSONB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daa_run_audit_events (
          event_id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES daa_runs(run_id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          kind TEXT NOT NULL,
          payload JSONB NOT NULL,
          actor_user_id TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_daa_run_audit_events_run_created_at
          ON daa_run_audit_events(run_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_daa_run_audit_events_created_event_desc
          ON daa_run_audit_events(created_at DESC, event_id DESC);

        CREATE INDEX IF NOT EXISTS idx_daa_run_audit_events_actor_created_at
          ON daa_run_audit_events(actor_user_id, created_at, event_id);

        CREATE INDEX IF NOT EXISTS idx_daa_run_audit_events_actor_created_event_desc
          ON daa_run_audit_events(actor_user_id, created_at DESC, event_id DESC);

        CREATE TABLE IF NOT EXISTS daa_admin_user_status (
          user_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await query("COMMIT");
    } catch (e) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  });

  return st.schemaInit;
}

export async function createDaaRunV0(args: {
  kind: string;
  status?: string;
  payload: unknown;
  createdAt?: string;
  actorUserId?: string;
}): Promise<{ runId: string; createdAt: string }> {
  await ensureDaaStoreSchemaPgV0();

  const createdAt = typeof args.createdAt === "string" && args.createdAt ? args.createdAt : nowIso();
  const kind = String(args.kind ?? "").trim();
  const status = String(args.status ?? "created").trim() || "created";
  if (!kind) throw new Error("missing kind");

  const runId = makeId("run");
  const payloadJson = safeJsonStringify(args.payload);
  const { actor, source } = deriveRunActorSourceV0({ kind, payload: args.payload });

  await withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(
        "INSERT INTO daa_runs (run_id, created_at, kind, status, payload, actor, source) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)",
        [runId, createdAt, kind, status, payloadJson, actor, source],
      );

      const eventId = makeId("audit");
      const auditPayloadJson = safeJsonStringify({ kind, status, payload: args.payload, actor, source });
      await query(
        "INSERT INTO daa_run_audit_events (event_id, run_id, created_at, kind, payload, actor_user_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
        [eventId, runId, createdAt, "run_created", auditPayloadJson, args.actorUserId || null],
      );

      await query("COMMIT");
    } catch (e) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  });

  await maybeCleanupAuditRetentionPgV0();

  return { runId, createdAt };
}

async function upsertRunAttachment(args: {
  table: "daa_run_portfolio" | "daa_run_confirm" | "daa_run_executed";
  runId: string;
  createdAt?: string;
  payload: unknown;
  auditKind?: string;
  auditPayload?: unknown;
  auditActorUserId?: string;
}) {
  await ensureDaaStoreSchemaPgV0();

  const runId = String(args.runId ?? "").trim();
  if (!runId) throw new Error("missing runId");

  const createdAt = typeof args.createdAt === "string" && args.createdAt ? args.createdAt : nowIso();
  const payloadJson = safeJsonStringify(args.payload);

  await withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      const chk = await query("SELECT run_id FROM daa_runs WHERE run_id = $1", [runId]);
      if (!chk.rowCount) throw new Error("run not found");

      await query(
        `INSERT INTO ${args.table} (run_id, created_at, payload) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT(run_id) DO UPDATE SET created_at=excluded.created_at, payload=excluded.payload`,
        [runId, createdAt, payloadJson],
      );

      const auditKind = String(args.auditKind ?? "").trim();
      if (auditKind) {
        const eventId = makeId("audit");
        const auditPayloadJson = safeJsonStringify(args.auditPayload ?? { table: args.table, payload: args.payload });
        await query(
          "INSERT INTO daa_run_audit_events (event_id, run_id, created_at, kind, payload, actor_user_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
          [eventId, runId, createdAt, auditKind, auditPayloadJson, args.auditActorUserId || null],
        );
      }

      await query("COMMIT");
    } catch (e) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  });

  await maybeCleanupAuditRetentionPgV0();
}

export async function setDaaRunPortfolioV0(args: { runId: string; payload: unknown; createdAt?: string; actorUserId?: string }) {
  return upsertRunAttachment({ table: "daa_run_portfolio", auditActorUserId: args.actorUserId, ...args });
}

export async function setDaaRunConfirmV0(args: { runId: string; payload: unknown; createdAt?: string; actorUserId?: string }) {
  return upsertRunAttachment({ table: "daa_run_confirm", auditKind: "confirm_set", auditPayload: { payload: args.payload }, auditActorUserId: args.actorUserId, ...args });
}

export async function setDaaRunExecutedV0(args: { runId: string; payload: unknown; createdAt?: string; actorUserId?: string }) {
  return upsertRunAttachment({ table: "daa_run_executed", auditKind: "executed_set", auditPayload: { payload: args.payload }, auditActorUserId: args.actorUserId, ...args });
}

export async function appendDaaRunAuditEventV0(args: {
  runId: string;
  kind: string;
  payload: unknown;
  createdAt?: string;
  actorUserId?: string;
}): Promise<{ eventId: string; createdAt: string }> {
  await ensureDaaStoreSchemaPgV0();

  const runId = String(args.runId ?? "").trim();
  const kind = String(args.kind ?? "").trim();
  if (!runId) throw new Error("missing runId");
  if (!kind) throw new Error("missing kind");

  const createdAt = typeof args.createdAt === "string" && args.createdAt ? args.createdAt : nowIso();
  const eventId = makeId("audit");
  const payloadJson = safeJsonStringify(args.payload);

  await withDaaPgClientV0(async ({ query }) => {
    const exists = await query("SELECT 1 FROM daa_runs WHERE run_id = $1", [runId]);
    if (!exists.rowCount) throw new Error("run not found");

    await query(
      "INSERT INTO daa_run_audit_events (event_id, run_id, created_at, kind, payload, actor_user_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
      [eventId, runId, createdAt, kind, payloadJson, args.actorUserId || null],
    );
  });

  await maybeCleanupAuditRetentionPgV0();

  return { eventId, createdAt };
}


export async function getDaaRunBundleV0(runIdRaw: string): Promise<DaaRunBundleV0> {
  await ensureDaaStoreSchemaPgV0();

  const runId = String(runIdRaw ?? "").trim();
  if (!runId) throw new Error("missing runId");

  return withDaaPgClientV0(async ({ query }) => {
    const runRes = await query(
      "SELECT run_id, created_at, kind, status, payload, actor, source FROM daa_runs WHERE run_id = $1",
      [runId],
    );

    const r0 = runRes.rows?.[0];
    if (!r0) throw new Error("run not found");

    const kind = String((r0 as any).kind ?? "");
    const payload = coerceJson((r0 as any).payload);

    let actor = String((r0 as any).actor ?? "").trim();
    let source = String((r0 as any).source ?? "").trim();

    if (!source || !actor) {
      const derived = deriveRunActorSourceV0({ kind, payload: payload ?? { source, actor } });
      if (!source) source = derived.source;
      if (!actor) actor = derived.actor;
    }
    if (!actor) actor = "unknown";

    const run: DaaRunRowV0 = {
      runId: String((r0 as any).run_id ?? ""),
      createdAt: String((r0 as any).created_at ?? ""),
      kind,
      status: String((r0 as any).status ?? ""),
      payload,
    };

    const [portfolioRes, confirmRes, executedRes, auditRes] = await Promise.all([
      query("SELECT created_at, payload FROM daa_run_portfolio WHERE run_id = $1", [runId]),
      query("SELECT created_at, payload FROM daa_run_confirm WHERE run_id = $1", [runId]),
      query("SELECT created_at, payload FROM daa_run_executed WHERE run_id = $1", [runId]),
      query(
        "SELECT event_id, run_id, created_at, kind, payload, actor_user_id FROM daa_run_audit_events WHERE run_id = $1 ORDER BY created_at ASC, event_id ASC",
        [runId],
      ),
    ]);

    const portfolioRow = portfolioRes.rows?.[0] as any;
    const confirmRow = confirmRes.rows?.[0] as any;
    const executedRow = executedRes.rows?.[0] as any;

    const audit: DaaRunAuditEventV0[] = (auditRes.rows || []).map((row: any) => ({
      eventId: String(row.event_id ?? ""),
      runId: String(row.run_id ?? ""),
      createdAt: String(row.created_at ?? ""),
      kind: String(row.kind ?? ""),
      actorUserId: String(row.actor_user_id ?? ""),
      payload: coerceJson(row.payload),
    }));

    return {
      run,
      portfolio: portfolioRow ? { createdAt: String(portfolioRow.created_at ?? ""), payload: coerceJson(portfolioRow.payload) } : null,
      confirm: confirmRow ? { createdAt: String(confirmRow.created_at ?? ""), payload: coerceJson(confirmRow.payload) } : null,
      executed: executedRow ? { createdAt: String(executedRow.created_at ?? ""), payload: coerceJson(executedRow.payload) } : null,
      audit,
    };
  });
}

export async function listDaaRunsV0(args?: {
  limit?: number;
  beforeCreatedAt?: string;
  beforeRunId?: string;
  fromCreatedAt?: string;
  toCreatedAt?: string;
  actor?: string;
  status?: string;
  source?: string;
}): Promise<DaaRunListRowV0[]> {
  await ensureDaaStoreSchemaPgV0();

  const limitRaw = args?.limit;
  const limit = Math.max(1, Math.min(200, Number.isFinite(Number(limitRaw)) ? Math.trunc(Number(limitRaw)) : 50));

  const beforeCreatedAt = typeof args?.beforeCreatedAt === "string" ? args?.beforeCreatedAt.trim() : "";
  const beforeRunId = typeof args?.beforeRunId === "string" ? args?.beforeRunId.trim() : "";

  const fromCreatedAt = typeof args?.fromCreatedAt === "string" ? args?.fromCreatedAt.trim() : "";
  const toCreatedAt = typeof args?.toCreatedAt === "string" ? args?.toCreatedAt.trim() : "";

  const actorRaw = typeof args?.actor === "string" ? args?.actor.trim() : "";
  const actorFilter = actorRaw && actorRaw !== "all" ? actorRaw : "";

  const statusRaw = typeof args?.status === "string" ? args?.status.trim() : "";
  const statusFilter = statusRaw && statusRaw !== "all" ? statusRaw : "";

  const sourceRaw = typeof args?.source === "string" ? args?.source.trim() : "";
  const sourceFilter = sourceRaw && sourceRaw !== "all" ? sourceRaw : "";

  return withDaaPgClientV0(async ({ query }) => {
    let sql = `
      SELECT
        run_id,
        created_at,
        kind,
        status,
        payload,
        actor,
        source,
        COALESCE(has_portfolio, false) AS has_portfolio,
        COALESCE(has_confirm, false) AS has_confirm,
        COALESCE(has_executed, false) AS has_executed,
        COALESCE(audit_count, 0) AS audit_count
      FROM daa_runs
      LEFT JOIN (SELECT run_id AS portfolio_run_id, TRUE AS has_portfolio FROM daa_run_portfolio) p ON p.portfolio_run_id = run_id
      LEFT JOIN (SELECT run_id AS confirm_run_id, TRUE AS has_confirm FROM daa_run_confirm) c ON c.confirm_run_id = run_id
      LEFT JOIN (SELECT run_id AS executed_run_id, TRUE AS has_executed FROM daa_run_executed) e ON e.executed_run_id = run_id
      LEFT JOIN (SELECT run_id AS audit_run_id, COUNT(1) AS audit_count FROM daa_run_audit_events GROUP BY run_id) a ON a.audit_run_id = run_id
    `.trim();

    const bind: any[] = [];
    const where: string[] = [];

    function pushWhere(clause: string, ...vals: any[]) {
      where.push(clause);
      bind.push(...vals);
    }

    if (fromCreatedAt) pushWhere(`created_at >= $${bind.length + 1}`, fromCreatedAt);
    if (toCreatedAt) pushWhere(`created_at <= $${bind.length + 1}`, toCreatedAt);
    if (actorFilter) pushWhere(`actor = $${bind.length + 1}`, actorFilter);
    if (statusFilter) pushWhere(`status = $${bind.length + 1}`, statusFilter);
    if (sourceFilter) pushWhere(`source = $${bind.length + 1}`, sourceFilter);

    if (beforeCreatedAt && beforeRunId) {
      const a = `$${bind.length + 1}`;
      const b = `$${bind.length + 2}`;
      pushWhere(`(created_at < ${a} OR (created_at = ${a} AND run_id < ${b}))`, beforeCreatedAt, beforeRunId);
    } else if (beforeCreatedAt) {
      pushWhere(`created_at < $${bind.length + 1}`, beforeCreatedAt);
    }

    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;

    bind.push(limit);
    sql += ` ORDER BY created_at DESC, run_id DESC LIMIT $${bind.length}`;

    const res = await query(sql, bind);

    return (res.rows || []).map((row: any) => {
      const kind = String(row.kind ?? "");
      const payload = coerceJson(row.payload);

      let source = String(row.source ?? "").trim();
      let actor = String(row.actor ?? "").trim();

      if (!source || !actor) {
        const derived = deriveRunActorSourceV0({ kind, payload: payload ?? { source, actor } });
        if (!source) source = derived.source;
        if (!actor) actor = derived.actor;
      }

      if (!actor) actor = "unknown";

      return {
        runId: String(row.run_id ?? ""),
        createdAt: String(row.created_at ?? ""),
        kind,
        status: String(row.status ?? ""),
        source,
        actor,
        hasPortfolio: Boolean(row.has_portfolio),
        hasConfirm: Boolean(row.has_confirm),
        hasExecuted: Boolean(row.has_executed),
        auditCount: Number(row.audit_count ?? 0) || 0,
      } satisfies DaaRunListRowV0;
    });
  });
}

export async function listDaaRunAuditEventsV0(args?: {
  limit?: number;
  beforeCreatedAt?: string;
  beforeEventId?: string;
  fromCreatedAt?: string;
  toCreatedAt?: string;
  actorUserId?: string;
}): Promise<DaaRunAuditEventListRowV0[]> {
  await ensureDaaStoreSchemaPgV0();

  const limitRaw = args?.limit;
  const limit = Math.max(1, Math.min(200, Number.isFinite(Number(limitRaw)) ? Math.trunc(Number(limitRaw)) : 50));

  const beforeCreatedAt = typeof args?.beforeCreatedAt === "string" ? args?.beforeCreatedAt.trim() : "";
  const beforeEventId = typeof args?.beforeEventId === "string" ? args?.beforeEventId.trim() : "";

  const fromCreatedAt = typeof args?.fromCreatedAt === "string" ? args?.fromCreatedAt.trim() : "";
  const toCreatedAt = typeof args?.toCreatedAt === "string" ? args?.toCreatedAt.trim() : "";

  const actorUserIdRaw = typeof args?.actorUserId === "string" ? args?.actorUserId.trim() : "";
  const actorUserId = actorUserIdRaw && actorUserIdRaw !== "all" ? actorUserIdRaw : "";

  return withDaaPgClientV0(async ({ query }) => {
    let sql = `
      SELECT event_id, run_id, created_at, kind, payload, actor_user_id
      FROM daa_run_audit_events
    `.trim();

    const bind: any[] = [];
    const where: string[] = [];

    function pushWhere(clause: string, ...vals: any[]) {
      where.push(clause);
      bind.push(...vals);
    }

    if (fromCreatedAt) pushWhere(`created_at >= $${bind.length + 1}`, fromCreatedAt);
    if (toCreatedAt) pushWhere(`created_at <= $${bind.length + 1}`, toCreatedAt);
    if (actorUserId) pushWhere(`actor_user_id = $${bind.length + 1}`, actorUserId);

    if (beforeCreatedAt && beforeEventId) {
      const a = `$${bind.length + 1}`;
      const b = `$${bind.length + 2}`;
      pushWhere(`(created_at < ${a} OR (created_at = ${a} AND event_id < ${b}))`, beforeCreatedAt, beforeEventId);
    } else if (beforeCreatedAt) {
      pushWhere(`created_at < $${bind.length + 1}`, beforeCreatedAt);
    }

    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;

    bind.push(limit);
    sql += ` ORDER BY created_at DESC, event_id DESC LIMIT $${bind.length}`;

    const res = await query(sql, bind);

    return (res.rows || []).map((row: any) => ({
      eventId: String(row.event_id ?? ""),
      runId: String(row.run_id ?? ""),
      createdAt: String(row.created_at ?? ""),
      kind: String(row.kind ?? ""),
      actorUserId: String(row.actor_user_id ?? ""),
      payload: coerceJson(row.payload),
    }));
  });
}
