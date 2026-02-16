import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";

import { ensureDaaAuthSchemaPgV0, isDaaPgEnabledV0, withDaaPgClientV0 } from "../pg/daaPgV0";

export type DaaAuthRoleV0 = "viewer" | "editor";
export type DaaAuthAccountStatusV0 = "active" | "inactive";

export type DaaAuthAccountV0 = {
  accountId: string;
  username: string;
  roles: DaaAuthRoleV0[];
  status: DaaAuthAccountStatusV0;
  createdAt: string;
  updatedAt: string;
};

export type DaaAuthSessionV0 = {
  sessionId: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  ip: string | null;
};

export type DaaAuthAuditEventListRowV0 = {
  eventId: string;
  createdAt: string;
  kind: string;
  actorUserId: string;
  accountId: string | null;
  sessionId: string | null;
  payload: unknown;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmailLoose(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return "";

  // Basic sanity check; keep server contract minimal and dependency-free.
  if (v.length > 254) return "";
  if (/\s/.test(v)) return "";

  const at = v.indexOf("@");
  if (at <= 0 || at !== v.lastIndexOf("@")) return "";

  const domain = v.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return "";
  if (!domain.includes(".")) return "";

  return v;
}

function normalizeEmailStrict(raw: unknown): string {
  const provided = typeof raw === "string" ? raw.trim() : "";
  const email = normalizeEmailLoose(raw);
  if (!provided) throw new Error("missing email");
  if (!email) throw new Error("invalid email");
  return email;
}

function normalizeRole(raw: unknown): DaaAuthRoleV0 | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "viewer") return "viewer";
  if (v === "editor") return "editor";
  return null;
}

function uniqRoles(raw: unknown): DaaAuthRoleV0[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: DaaAuthRoleV0[] = [];
  for (const r of xs) {
    const rr = normalizeRole(r);
    if (!rr) continue;
    if (!out.includes(rr)) out.push(rr);
  }
  return out;
}

function normalizeStatus(raw: unknown): DaaAuthAccountStatusV0 {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "inactive") return "inactive";
  return "active";
}

function parseJsonArrayOrEmpty(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

function b64url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function hashPasswordV0(passwordRaw: unknown): string {
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (!password) throw new Error("missing password");

  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64url(salt)}$${b64url(dk)}`;
}

export function verifyPasswordV0(passwordRaw: unknown, storedHashRaw: unknown): boolean {
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const stored = typeof storedHashRaw === "string" ? storedHashRaw.trim() : "";
  if (!password || !stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  if (parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = fromB64url(parts[4] || "");
  const expect = fromB64url(parts[5] || "");
  if (!salt.length || !expect.length) return false;

  const actual = scryptSync(password, salt, expect.length, { N, r, p });
  try {
    return timingSafeEqual(actual, expect);
  } catch {
    return false;
  }
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function ensureIsoOrNow(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return nowIso();
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return nowIso();
  return new Date(t).toISOString();
}

function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(iso);
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function isPgUniqueViolationV0(e: any): boolean {
  // pg error code 23505 = unique_violation.
  return Boolean(e && typeof e === "object" && (e as any).code === "23505");
}

async function ensureAuthSchemaIfPgV0(): Promise<void> {
  if (!isDaaPgEnabledV0()) throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
  await ensureDaaAuthSchemaPgV0();
}

function rowToAuthAuditEventV0(row: any): DaaAuthAuditEventListRowV0 {
  let payload: unknown = {};
  if (row?.payload_json && typeof row.payload_json === "string") {
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = {};
    }
  }

  return {
    eventId: String(row?.event_id ?? ""),
    createdAt: String(row?.created_at ?? ""),
    kind: String(row?.kind ?? ""),
    actorUserId: String(row?.actor_user_id ?? ""),
    accountId: typeof row?.account_id === "string" && row.account_id ? row.account_id : null,
    sessionId: typeof row?.session_id === "string" && row.session_id ? row.session_id : null,
    payload,
  };
}

export async function appendDaaAuthAuditEventV0(args: {
  kind: string;
  actorUserId: string;
  payload: unknown;
  accountId?: string | null;
  sessionId?: string | null;
  createdAt?: string;
}): Promise<DaaAuthAuditEventListRowV0> {
  const kind = String(args.kind ?? "").trim();
  const actorUserId = String(args.actorUserId ?? "").trim();
  if (!kind) throw new Error("missing kind");
  if (!actorUserId) throw new Error("missing actorUserId");

  const createdAt = ensureIsoOrNow(args.createdAt);
  const eventId = randomUUID();
  const accountId = typeof args.accountId === "string" && args.accountId.trim() ? args.accountId.trim() : null;
  const sessionId = typeof args.sessionId === "string" && args.sessionId.trim() ? args.sessionId.trim() : null;

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const row = await withDaaPgClientV0(async ({ query }) => {
      const r = await query(
        "INSERT INTO daa_auth_audit_events (event_id, created_at, kind, actor_user_id, account_id, session_id, payload_json) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING event_id, created_at, kind, actor_user_id, account_id, session_id, payload_json",
        [eventId, createdAt, kind, actorUserId, accountId, sessionId, JSON.stringify(args.payload ?? {})],
      );
      return (r.rows && r.rows[0]) || null;
    });

    if (!row) throw new Error("failed to append auth audit event");
    return rowToAuthAuditEventV0(row);
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function listDaaAuthAuditEventsV0(args: {
  limit?: number;
  beforeCreatedAt?: string;
  beforeEventId?: string;
  fromCreatedAt?: string;
  toCreatedAt?: string;
  actorUserId?: string;
} = {}): Promise<DaaAuthAuditEventListRowV0[]> {
  const limitNum = Number(args.limit);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(500, Math.trunc(limitNum))) : 50;

  const beforeCreatedAt = String(args.beforeCreatedAt ?? "").trim() || null;
  const beforeEventId = String(args.beforeEventId ?? "").trim() || null;
  const fromCreatedAt = String(args.fromCreatedAt ?? "").trim() || null;
  const toCreatedAt = String(args.toCreatedAt ?? "").trim() || null;
  const actorUserId = String(args.actorUserId ?? "").trim() || null;

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const rows = await withDaaPgClientV0(async ({ query }) => {
      const values: any[] = [];
      const where: string[] = [];
      let i = 1;

      if (beforeCreatedAt && beforeEventId) {
        where.push(`(created_at < $${i} OR (created_at = $${i} AND event_id < $${i + 1}))`);
        values.push(beforeCreatedAt, beforeEventId);
        i += 2;
      }

      if (fromCreatedAt) {
        where.push(`created_at >= $${i}`);
        values.push(fromCreatedAt);
        i += 1;
      }

      if (toCreatedAt) {
        where.push(`created_at <= $${i}`);
        values.push(toCreatedAt);
        i += 1;
      }

      if (actorUserId) {
        where.push(`actor_user_id = $${i}`);
        values.push(actorUserId);
        i += 1;
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      values.push(limit);

      const sql = `
        SELECT event_id, created_at, kind, actor_user_id, account_id, session_id, payload_json
        FROM daa_auth_audit_events
        ${whereSql}
        ORDER BY created_at DESC, event_id DESC
        LIMIT $${i}
      `;

      const r = await query(sql, values);
      return r.rows ?? [];
    });

    return rows.map(rowToAuthAuditEventV0);
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function createDaaAuthAccountV0(args: {
  username: string;
  password: string;
  roles?: DaaAuthRoleV0[];
  createdAt?: string;
}): Promise<DaaAuthAccountV0> {
  const username = normalizeEmailStrict(args.username);

  const passwordHash = hashPasswordV0(args.password);
  const roles = uniqRoles(args.roles);

  const createdAt = ensureIsoOrNow(args.createdAt);
  const updatedAt = createdAt;
  const accountId = randomUUID();

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    try {
      await withDaaPgClientV0(async ({ query }) => {
        await query(
          "INSERT INTO daa_auth_accounts (account_id, username, password_hash, roles_json, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [accountId, username, passwordHash, JSON.stringify(roles), "active", createdAt, updatedAt],
        );
      });
    } catch (e: any) {
      if (isPgUniqueViolationV0(e)) throw new Error("unique constraint violation");
      throw e;
    }

    return { accountId, username, roles, status: "active", createdAt, updatedAt };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function hasAnyDaaAuthAccountsV0(): Promise<boolean> {
  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const n = await withDaaPgClientV0(async ({ query }) => {
      const r = await query("SELECT 1 FROM daa_auth_accounts LIMIT 1");
      return r.rowCount || 0;
    });
    return n > 0;
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function bootstrapCreateFirstDaaAuthAccountV0(args: {
  username: string;
  password: string;
  roles?: DaaAuthRoleV0[];
  createdAt?: string;
}): Promise<DaaAuthAccountV0> {
  const username = normalizeEmailStrict(args.username);
  const passwordHash = hashPasswordV0(args.password);

  // First admin should always be able to administer the dashboard.
  const roles = uniqRoles(args.roles);
  if (!roles.includes("editor")) roles.unshift("editor");

  const createdAt = ensureIsoOrNow(args.createdAt);
  const updatedAt = createdAt;
  const accountId = randomUUID();

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    try {
      await withDaaPgClientV0(async ({ query }) => {
        await query("BEGIN");
        try {
          // Prevent races when two bootstraps are attempted concurrently.
          if (process.env.DAA_PG_MEM !== "1") {
            await query("LOCK TABLE daa_auth_accounts IN EXCLUSIVE MODE");
          }

          const r0 = await query("SELECT COUNT(1) AS n FROM daa_auth_accounts");
          const n = Number(r0.rows?.[0]?.n ?? 0) || 0;
          if (n > 0) throw new Error("bootstrap not allowed: accounts already exist");

          await query(
            "INSERT INTO daa_auth_accounts (account_id, username, password_hash, roles_json, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [accountId, username, passwordHash, JSON.stringify(roles), "active", createdAt, updatedAt],
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
    } catch (e: any) {
      if (isPgUniqueViolationV0(e)) throw new Error("unique constraint violation");
      throw e;
    }

    return { accountId, username, roles, status: "active", createdAt, updatedAt };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function getDaaAuthAccountByUsernameV0(usernameRaw: unknown): Promise<DaaAuthAccountV0 | null> {
  const username = normalizeEmailStrict(usernameRaw);

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const row = await withDaaPgClientV0(async ({ query }) => {
      const r = await query(
        "SELECT account_id, username, roles_json, status, created_at, updated_at FROM daa_auth_accounts WHERE username = $1",
        [username],
      );
      return (r.rows && r.rows[0]) || null;
    });

    if (!row) return null;

    const roles = uniqRoles(parseJsonArrayOrEmpty((row as any).roles_json));
    return {
      accountId: String((row as any).account_id ?? ""),
      username: String((row as any).username ?? ""),
      roles,
      status: normalizeStatus((row as any).status),
      createdAt: String((row as any).created_at ?? ""),
      updatedAt: String((row as any).updated_at ?? ""),
    };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function authenticateDaaAuthAccountV0(args: {
  username: string;
  password: string;
}): Promise<DaaAuthAccountV0 | null> {
  const username = normalizeEmailLoose(args.username);
  const password = typeof args.password === "string" ? args.password : "";
  if (!username || !password) return null;

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const row = await withDaaPgClientV0(async ({ query }) => {
      const r = await query(
        "SELECT account_id, username, password_hash, roles_json, status, created_at, updated_at FROM daa_auth_accounts WHERE username = $1",
        [username],
      );
      return (r.rows && r.rows[0]) || null;
    });

    if (!row) return null;
    if (!verifyPasswordV0(password, (row as any).password_hash)) return null;

    const status = normalizeStatus((row as any).status);
    if (status !== "active") return null;

    return {
      accountId: String((row as any).account_id ?? ""),
      username: String((row as any).username ?? ""),
      roles: uniqRoles(parseJsonArrayOrEmpty((row as any).roles_json)),
      status,
      createdAt: String((row as any).created_at ?? ""),
      updatedAt: String((row as any).updated_at ?? ""),
    };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function createDaaAuthSessionV0(args: {
  accountId: string;
  ttlDays?: number;
  createdAt?: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ session: DaaAuthSessionV0; token: string }> {
  const accountId = String(args.accountId ?? "").trim();
  if (!accountId) throw new Error("missing accountId");

  const createdAt = ensureIsoOrNow(args.createdAt);
  const ttlDays = Number.isFinite(args.ttlDays) ? Math.max(1, Math.floor(args.ttlDays!)) : 30;
  const expiresAt = addDaysIso(createdAt, ttlDays);

  const token = b64url(randomBytes(32));
  const tokenSha256 = sha256Hex(token);
  const sessionId = randomUUID();

  const userAgent = typeof args.userAgent === "string" ? args.userAgent.trim() : "";
  const ip = typeof args.ip === "string" ? args.ip.trim() : "";

  const session: DaaAuthSessionV0 = {
    sessionId,
    accountId,
    createdAt,
    expiresAt,
    revokedAt: null,
    lastSeenAt: null,
    userAgent: userAgent || null,
    ip: ip || null,
  };

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    await withDaaPgClientV0(async ({ query }) => {
      await query(
        "INSERT INTO daa_auth_sessions (session_id, account_id, token_sha256, created_at, expires_at, revoked_at, user_agent, ip, last_seen_at) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, NULL)",
        [sessionId, accountId, tokenSha256, createdAt, expiresAt, session.userAgent, session.ip],
      );
    });
  } else {

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
  }

  return { session, token };
}

export async function getDaaAuthAccountBySessionTokenV0(args: {
  token: string;
  now?: string;
  touch?: boolean;
}): Promise<{ account: DaaAuthAccountV0; session: DaaAuthSessionV0 } | null> {
  const token = typeof args.token === "string" ? args.token.trim() : "";
  if (!token) return null;

  const tokenSha256 = sha256Hex(token);
  const now = ensureIsoOrNow(args.now);
  const touch = args.touch !== false;

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    return withDaaPgClientV0(async ({ query }) => {
      const r = await query(
        "SELECT " +
          " s.session_id, s.account_id, s.created_at, s.expires_at, s.revoked_at, s.user_agent, s.ip, s.last_seen_at, " +
          " a.username, a.roles_json, a.status, a.created_at AS a_created_at, a.updated_at AS a_updated_at " +
          "FROM daa_auth_sessions s " +
          "JOIN daa_auth_accounts a ON a.account_id = s.account_id " +
          "WHERE s.token_sha256 = $1 LIMIT 1",
        [tokenSha256],
      );

      const row = (r.rows && r.rows[0]) || null;
      if (!row) return null;

      const revokedAt = typeof (row as any).revoked_at === "string" && (row as any).revoked_at.trim() ? String((row as any).revoked_at) : null;
      if (revokedAt) return null;

      const expiresAt = String((row as any).expires_at ?? "");
      if (!expiresAt) return null;
      if (Date.parse(expiresAt) <= Date.parse(now)) return null;

      const status = normalizeStatus((row as any).status);
      if (status !== "active") return null;

      const account: DaaAuthAccountV0 = {
        accountId: String((row as any).account_id ?? ""),
        username: String((row as any).username ?? ""),
        roles: uniqRoles(parseJsonArrayOrEmpty((row as any).roles_json)),
        status,
        createdAt: String((row as any).a_created_at ?? ""),
        updatedAt: String((row as any).a_updated_at ?? ""),
      };

      const session: DaaAuthSessionV0 = {
        sessionId: String((row as any).session_id ?? ""),
        accountId: String((row as any).account_id ?? ""),
        createdAt: String((row as any).created_at ?? ""),
        expiresAt,
        revokedAt,
        lastSeenAt:
          typeof (row as any).last_seen_at === "string" && (row as any).last_seen_at.trim() ? String((row as any).last_seen_at) : null,
        userAgent:
          typeof (row as any).user_agent === "string" && (row as any).user_agent.trim() ? String((row as any).user_agent) : null,
        ip: typeof (row as any).ip === "string" && (row as any).ip.trim() ? String((row as any).ip) : null,
      };

      if (touch) {
        await query("UPDATE daa_auth_sessions SET last_seen_at = $1 WHERE session_id = $2", [now, session.sessionId]);
        session.lastSeenAt = now;
      }

      return { account, session };
    });
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function refreshDaaAuthSessionV0(args: {
  sessionId: string;
  now?: string;
  ttlDays?: number;
}): Promise<DaaAuthSessionV0 | null> {
  const sessionId = String(args.sessionId ?? "").trim();
  if (!sessionId) return null;

  const now = ensureIsoOrNow(args.now);
  const ttlDays = Number.isFinite(args.ttlDays) ? Math.max(1, Math.floor(args.ttlDays!)) : 30;
  const expiresAt = addDaysIso(now, ttlDays);

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const row = await withDaaPgClientV0(async ({ query }) => {
      const r = await query(
        "UPDATE daa_auth_sessions SET expires_at = $1, last_seen_at = $2 WHERE session_id = $3 AND revoked_at IS NULL AND expires_at > $2 RETURNING session_id, account_id, created_at, expires_at, revoked_at, user_agent, ip, last_seen_at",
        [expiresAt, now, sessionId],
      );
      return (r.rows && r.rows[0]) || null;
    });

    if (!row) return null;

    return {
      sessionId: String((row as any).session_id ?? ""),
      accountId: String((row as any).account_id ?? ""),
      createdAt: String((row as any).created_at ?? ""),
      expiresAt: String((row as any).expires_at ?? ""),
      revokedAt:
        typeof (row as any).revoked_at === "string" && (row as any).revoked_at.trim() ? String((row as any).revoked_at) : null,
      lastSeenAt:
        typeof (row as any).last_seen_at === "string" && (row as any).last_seen_at.trim()
          ? String((row as any).last_seen_at)
          : null,
      userAgent:
        typeof (row as any).user_agent === "string" && (row as any).user_agent.trim() ? String((row as any).user_agent) : null,
      ip: typeof (row as any).ip === "string" && (row as any).ip.trim() ? String((row as any).ip) : null,
    };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function revokeDaaAuthSessionV0(args: { sessionId: string; revokedAt?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessionId = String(args.sessionId ?? "").trim();
  if (!sessionId) return { ok: false, error: "missing sessionId" };

  const revokedAt = ensureIsoOrNow(args.revokedAt);

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    await withDaaPgClientV0(async ({ query }) => {
      await query("UPDATE daa_auth_sessions SET revoked_at = $1 WHERE session_id = $2", [revokedAt, sessionId]);
    });
  } else {

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
  }

  return { ok: true };
}

function rowToAccountV0(row: any): DaaAuthAccountV0 {
  const roles = uniqRoles(parseJsonArrayOrEmpty(row?.roles_json));
  return {
    accountId: String(row?.account_id ?? ""),
    username: String(row?.username ?? ""),
    roles,
    status: normalizeStatus(row?.status),
    createdAt: String(row?.created_at ?? ""),
    updatedAt: String(row?.updated_at ?? ""),
  };
}

export async function listDaaAuthAccountsV0(): Promise<DaaAuthAccountV0[]> {
  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const rows = await withDaaPgClientV0(async ({ query }) => {
      const r = await query(
        "SELECT account_id, username, roles_json, status, created_at, updated_at FROM daa_auth_accounts ORDER BY username ASC",
      );
      return r.rows ?? [];
    });

    return rows.map(rowToAccountV0);
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function updateDaaAuthAccountV0(args: {
  accountId: string;
  roles?: DaaAuthRoleV0[];
  status?: DaaAuthAccountStatusV0;
  updatedAt?: string;
}): Promise<{ ok: true; account: DaaAuthAccountV0 } | { ok: false; error: string }> {
  const accountId = String(args.accountId ?? "").trim();
  if (!accountId) return { ok: false, error: "missing accountId" };

  const updatedAt = ensureIsoOrNow(args.updatedAt);

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const out = await withDaaPgClientV0(async ({ query }) => {
      const r0 = await query(
        "SELECT account_id, username, roles_json, status, created_at, updated_at FROM daa_auth_accounts WHERE account_id = $1",
        [accountId],
      );
      const row0 = (r0.rows && r0.rows[0]) || null;
      if (!row0) return null;

      const nextRoles = args.roles === undefined ? uniqRoles(parseJsonArrayOrEmpty((row0 as any).roles_json)) : uniqRoles(args.roles);
      const nextStatus = args.status === undefined ? normalizeStatus((row0 as any).status) : normalizeStatus(args.status);

      await query("UPDATE daa_auth_accounts SET roles_json = $1, status = $2, updated_at = $3 WHERE account_id = $4", [
        JSON.stringify(nextRoles),
        nextStatus,
        updatedAt,
        accountId,
      ]);

      const r1 = await query(
        "SELECT account_id, username, roles_json, status, created_at, updated_at FROM daa_auth_accounts WHERE account_id = $1",
        [accountId],
      );
      return (r1.rows && r1.rows[0]) || null;
    });

    if (!out) return { ok: false, error: "not_found" };
    return { ok: true, account: rowToAccountV0(out) };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}

export async function deleteDaaAuthAccountV0(args: { accountId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountId = String(args.accountId ?? "").trim();
  if (!accountId) return { ok: false, error: "missing accountId" };

  await ensureAuthSchemaIfPgV0();

  if (isDaaPgEnabledV0()) {
    const n = await withDaaPgClientV0(async ({ query }) => {
      const r = await query("DELETE FROM daa_auth_accounts WHERE account_id = $1", [accountId]);
      return r.rowCount || 0;
    });

    if (n <= 0) return { ok: false, error: "not_found" };
    return { ok: true };
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
}
