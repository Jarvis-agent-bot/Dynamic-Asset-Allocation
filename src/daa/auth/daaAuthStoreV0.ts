import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";

import { withDaaSqliteDbV0 } from "../sqlite/daaSqliteDbV0";

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

  return withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare(
      "INSERT INTO daa_auth_accounts (account_id, username, password_hash, roles_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    try {
      stmt.run([accountId, username, passwordHash, JSON.stringify(roles), "active", createdAt, updatedAt]);
    } finally {
      stmt.free();
    }

    markDirty();
    return { accountId, username, roles, status: "active", createdAt, updatedAt };
  });
}

export async function hasAnyDaaAuthAccountsV0(): Promise<boolean> {
  return withDaaSqliteDbV0(async ({ db }) => {
    const stmt = db.prepare("SELECT 1 FROM daa_auth_accounts LIMIT 1");
    try {
      return stmt.step();
    } finally {
      stmt.free();
    }
  });
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

  return withDaaSqliteDbV0(async ({ db, markDirty }) => {
    db.exec("BEGIN");
    try {
      const countStmt = db.prepare("SELECT COUNT(1) AS n FROM daa_auth_accounts");
      let n = 0;
      try {
        countStmt.step();
        const row = countStmt.getAsObject();
        n = Number((row as any).n ?? 0) || 0;
      } finally {
        countStmt.free();
      }

      if (n > 0) throw new Error("bootstrap not allowed: accounts already exist");

      const stmt = db.prepare(
        "INSERT INTO daa_auth_accounts (account_id, username, password_hash, roles_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      try {
        stmt.run([accountId, username, passwordHash, JSON.stringify(roles), "active", createdAt, updatedAt]);
      } finally {
        stmt.free();
      }

      db.exec("COMMIT");
      markDirty();
      return { accountId, username, roles, status: "active", createdAt, updatedAt };
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  });
}

export async function getDaaAuthAccountByUsernameV0(usernameRaw: unknown): Promise<DaaAuthAccountV0 | null> {
  const username = normalizeEmailStrict(usernameRaw);

  return withDaaSqliteDbV0(async ({ db }) => {
    const stmt = db.prepare(
      "SELECT account_id, username, roles_json, status, created_at, updated_at FROM daa_auth_accounts WHERE username = ?",
    );
    try {
      stmt.bind([username]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject();
      const roles = uniqRoles(parseJsonArrayOrEmpty((row as any).roles_json));
      return {
        accountId: String((row as any).account_id ?? ""),
        username: String((row as any).username ?? ""),
        roles,
        status: normalizeStatus((row as any).status),
        createdAt: String((row as any).created_at ?? ""),
        updatedAt: String((row as any).updated_at ?? ""),
      };
    } finally {
      stmt.free();
    }
  });
}

export async function authenticateDaaAuthAccountV0(args: {
  username: string;
  password: string;
}): Promise<DaaAuthAccountV0 | null> {
  const username = normalizeEmailLoose(args.username);
  const password = typeof args.password === "string" ? args.password : "";
  if (!username || !password) return null;

  return withDaaSqliteDbV0(async ({ db }) => {
    const stmt = db.prepare(
      "SELECT account_id, username, password_hash, roles_json, status, created_at, updated_at FROM daa_auth_accounts WHERE username = ?",
    );
    try {
      stmt.bind([username]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject();
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
    } finally {
      stmt.free();
    }
  });
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

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare(
      "INSERT INTO daa_auth_sessions (session_id, account_id, token_sha256, created_at, expires_at, revoked_at, user_agent, ip, last_seen_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)",
    );
    try {
      stmt.run([sessionId, accountId, tokenSha256, createdAt, expiresAt, session.userAgent, session.ip]);
    } finally {
      stmt.free();
    }
    markDirty();
  });

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

  return withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare(
      "SELECT " +
        " s.session_id, s.account_id, s.created_at, s.expires_at, s.revoked_at, s.user_agent, s.ip, s.last_seen_at, " +
        " a.username, a.roles_json, a.status, a.created_at AS a_created_at, a.updated_at AS a_updated_at " +
        "FROM daa_auth_sessions s " +
        "JOIN daa_auth_accounts a ON a.account_id = s.account_id " +
        "WHERE s.token_sha256 = ? LIMIT 1",
    );

    try {
      stmt.bind([tokenSha256]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject();

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
        const touchStmt = db.prepare("UPDATE daa_auth_sessions SET last_seen_at = ? WHERE session_id = ?");
        try {
          touchStmt.run([now, session.sessionId]);
        } finally {
          touchStmt.free();
        }
        markDirty();
        session.lastSeenAt = now;
      }

      return { account, session };
    } finally {
      stmt.free();
    }
  });
}

export async function revokeDaaAuthSessionV0(args: { sessionId: string; revokedAt?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessionId = String(args.sessionId ?? "").trim();
  if (!sessionId) return { ok: false, error: "missing sessionId" };

  const revokedAt = ensureIsoOrNow(args.revokedAt);

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare("UPDATE daa_auth_sessions SET revoked_at = ? WHERE session_id = ?");
    try {
      stmt.run([revokedAt, sessionId]);
    } finally {
      stmt.free();
    }
    markDirty();
  });

  return { ok: true };
}
