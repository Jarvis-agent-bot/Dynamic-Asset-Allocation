import { withDaaSqliteDbV0 } from "./daaSqliteDbV0";

function nowIso() {
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
    // Keep error deterministic.
    throw new Error("payload is not JSON-serializable");
  }
}

function parseJson<T = unknown>(raw: string): T {
  return JSON.parse(raw) as T;
}

export type DaaRunRowV0 = {
  runId: string;
  createdAt: string;
  kind: string;
  status: string;
  payload: unknown;
};

export type DaaRunAuditEventV0 = {
  eventId: string;
  runId: string;
  createdAt: string;
  kind: string;
  payload: unknown;
};

export type DaaRunBundleV0 = {
  run: DaaRunRowV0;
  portfolio: { createdAt: string; payload: unknown } | null;
  confirm: { createdAt: string; payload: unknown } | null;
  executed: { createdAt: string; payload: unknown } | null;
  audit: DaaRunAuditEventV0[];
};

export async function createDaaRunV0(args: {
  kind: string;
  status?: string;
  payload: unknown;
  createdAt?: string;
}): Promise<{ runId: string; createdAt: string }> {
  const createdAt = typeof args.createdAt === "string" && args.createdAt ? args.createdAt : nowIso();
  const kind = String(args.kind ?? "").trim();
  const status = String(args.status ?? "created").trim() || "created";
  if (!kind) throw new Error("missing kind");

  const runId = makeId("run");
  const payloadJson = safeJsonStringify(args.payload);

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare(
      "INSERT INTO daa_runs (run_id, created_at, kind, status, payload_json) VALUES (?, ?, ?, ?, ?)"
    );
    try {
      stmt.run([runId, createdAt, kind, status, payloadJson]);
    } finally {
      stmt.free();
    }
    markDirty();
  });

  return { runId, createdAt };
}

async function upsertRunAttachment(args: {
  table: "daa_run_portfolio" | "daa_run_confirm" | "daa_run_executed";
  runId: string;
  createdAt?: string;
  payload: unknown;
}) {
  const runId = String(args.runId ?? "").trim();
  if (!runId) throw new Error("missing runId");

  const createdAt = typeof args.createdAt === "string" && args.createdAt ? args.createdAt : nowIso();
  const payloadJson = safeJsonStringify(args.payload);

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    // Ensure run exists so FK constraints remain meaningful.
    const check = db.prepare("SELECT run_id FROM daa_runs WHERE run_id = ?");
    try {
      check.bind([runId]);
      if (!check.step()) throw new Error("run not found");
    } finally {
      check.free();
    }

    const stmt = db.prepare(
      `INSERT INTO ${args.table} (run_id, created_at, payload_json) VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET created_at=excluded.created_at, payload_json=excluded.payload_json`
    );
    try {
      stmt.run([runId, createdAt, payloadJson]);
    } finally {
      stmt.free();
    }

    markDirty();
  });
}

export async function setDaaRunPortfolioV0(args: { runId: string; payload: unknown; createdAt?: string }) {
  return upsertRunAttachment({ table: "daa_run_portfolio", ...args });
}

export async function setDaaRunConfirmV0(args: { runId: string; payload: unknown; createdAt?: string }) {
  return upsertRunAttachment({ table: "daa_run_confirm", ...args });
}

export async function setDaaRunExecutedV0(args: { runId: string; payload: unknown; createdAt?: string }) {
  return upsertRunAttachment({ table: "daa_run_executed", ...args });
}

export async function appendDaaRunAuditEventV0(args: {
  runId: string;
  kind: string;
  payload: unknown;
  createdAt?: string;
}): Promise<{ eventId: string; createdAt: string }> {
  const runId = String(args.runId ?? "").trim();
  const kind = String(args.kind ?? "").trim();
  if (!runId) throw new Error("missing runId");
  if (!kind) throw new Error("missing kind");

  const createdAt = typeof args.createdAt === "string" && args.createdAt ? args.createdAt : nowIso();
  const eventId = makeId("audit");
  const payloadJson = safeJsonStringify(args.payload);

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare(
      "INSERT INTO daa_run_audit_events (event_id, run_id, created_at, kind, payload_json) VALUES (?, ?, ?, ?, ?)"
    );
    try {
      stmt.run([eventId, runId, createdAt, kind, payloadJson]);
    } finally {
      stmt.free();
    }
    markDirty();
  });

  return { eventId, createdAt };
}

function selectOneJson(args: { db: any; sql: string; bind: any[] }): { createdAt: string; payload: unknown } | null {
  const stmt = args.db.prepare(args.sql);
  try {
    stmt.bind(args.bind);
    if (!stmt.step()) return null;
    const row = stmt.getAsObject();
    const createdAt = String((row as any).created_at ?? "");
    const payloadJson = String((row as any).payload_json ?? "");
    if (!createdAt || !payloadJson) return null;
    return { createdAt, payload: parseJson(payloadJson) };
  } finally {
    stmt.free();
  }
}

export async function getDaaRunBundleV0(runIdRaw: string): Promise<DaaRunBundleV0> {
  const runId = String(runIdRaw ?? "").trim();
  if (!runId) throw new Error("missing runId");

  return withDaaSqliteDbV0(async ({ db }) => {
    const runStmt = db.prepare(
      "SELECT run_id, created_at, kind, status, payload_json FROM daa_runs WHERE run_id = ?"
    );

    let run: DaaRunRowV0 | null = null;
    try {
      runStmt.bind([runId]);
      if (runStmt.step()) {
        const row = runStmt.getAsObject();
        const payloadJson = String((row as any).payload_json ?? "");
        run = {
          runId: String((row as any).run_id ?? ""),
          createdAt: String((row as any).created_at ?? ""),
          kind: String((row as any).kind ?? ""),
          status: String((row as any).status ?? ""),
          payload: payloadJson ? parseJson(payloadJson) : null,
        };
      }
    } finally {
      runStmt.free();
    }

    if (!run) throw new Error("run not found");

    const portfolio = selectOneJson({
      db,
      sql: "SELECT created_at, payload_json FROM daa_run_portfolio WHERE run_id = ?",
      bind: [runId],
    });

    const confirm = selectOneJson({
      db,
      sql: "SELECT created_at, payload_json FROM daa_run_confirm WHERE run_id = ?",
      bind: [runId],
    });

    const executed = selectOneJson({
      db,
      sql: "SELECT created_at, payload_json FROM daa_run_executed WHERE run_id = ?",
      bind: [runId],
    });

    const auditStmt = db.prepare(
      "SELECT event_id, run_id, created_at, kind, payload_json FROM daa_run_audit_events WHERE run_id = ? ORDER BY created_at ASC"
    );

    const audit: DaaRunAuditEventV0[] = [];
    try {
      auditStmt.bind([runId]);
      while (auditStmt.step()) {
        const row = auditStmt.getAsObject();
        const payloadJson = String((row as any).payload_json ?? "");
        audit.push({
          eventId: String((row as any).event_id ?? ""),
          runId: String((row as any).run_id ?? ""),
          createdAt: String((row as any).created_at ?? ""),
          kind: String((row as any).kind ?? ""),
          payload: payloadJson ? parseJson(payloadJson) : null,
        });
      }
    } finally {
      auditStmt.free();
    }

    return { run, portfolio, confirm, executed, audit };
  });
}
