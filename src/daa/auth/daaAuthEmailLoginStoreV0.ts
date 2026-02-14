import { createHash, randomBytes, randomUUID } from "node:crypto";

import { withDaaSqliteDbV0 } from "../sqlite/daaSqliteDbV0";

import {
  createDaaAuthSessionV0,
  getDaaAuthAccountBySessionTokenV0,
  getDaaAuthAccountByUsernameV0,
} from "./daaAuthStoreV0";

import type { DaaAuthAccountV0, DaaAuthSessionV0 } from "./daaAuthStoreV0";

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutesIso(iso: string, minutes: number): string {
  const ms = Date.parse(iso);
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

function b64url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function normalizeEmailLoose(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return "";

  // Keep contract consistent with the password auth store.
  if (v.length > 254) return "";
  if (/\s/.test(v)) return "";

  const at = v.indexOf("@");
  if (at <= 0 || at !== v.lastIndexOf("@")) return "";

  const domain = v.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return "";
  if (!domain.includes(".")) return "";

  return v;
}

export type DaaAuthEmailLoginTokenV0 = {
  tokenId: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  userAgent: string | null;
  ip: string | null;
};

export async function createDaaAuthEmailLoginTokenV0(args: {
  accountId: string;
  ttlMinutes?: number;
  createdAt?: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<{ token: string; row: DaaAuthEmailLoginTokenV0 }> {
  const accountId = String(args.accountId ?? "").trim();
  if (!accountId) throw new Error("missing accountId");

  const ttlMinutesRaw = Number.isFinite(args.ttlMinutes) ? Number(args.ttlMinutes) : 15;
  const ttlMinutes = Math.max(3, Math.min(60, Math.floor(ttlMinutesRaw)));

  const createdAt = typeof args.createdAt === "string" && args.createdAt.trim() ? args.createdAt.trim() : nowIso();
  const expiresAt = addMinutesIso(createdAt, ttlMinutes);

  const userAgent = typeof args.userAgent === "string" ? args.userAgent.trim() : "";
  const ip = typeof args.ip === "string" ? args.ip.trim() : "";

  const token = b64url(randomBytes(32));
  const tokenSha256 = sha256Hex(token);
  const tokenId = randomUUID();

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    const stmt = db.prepare(
      "INSERT INTO daa_auth_email_login_tokens (token_id, account_id, token_sha256, created_at, expires_at, used_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)"
    );
    try {
      stmt.run([tokenId, accountId, tokenSha256, createdAt, expiresAt, userAgent || null, ip || null]);
    } finally {
      stmt.free();
    }
    markDirty();
  });

  return {
    token,
    row: {
      tokenId,
      accountId,
      createdAt,
      expiresAt,
      usedAt: null,
      userAgent: userAgent || null,
      ip: ip || null,
    },
  };
}

export async function findLastDaaAuthEmailLoginTokenCreatedAtV0(args: { accountId: string }): Promise<string | null> {
  const accountId = String(args.accountId ?? "").trim();
  if (!accountId) return null;

  return withDaaSqliteDbV0(async ({ db }) => {
    const stmt = db.prepare(
      "SELECT created_at FROM daa_auth_email_login_tokens WHERE account_id = ? ORDER BY created_at DESC, token_id DESC LIMIT 1"
    );
    try {
      stmt.bind([accountId]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject();
      return typeof (row as any).created_at === "string" ? String((row as any).created_at) : null;
    } finally {
      stmt.free();
    }
  });
}

export async function consumeDaaAuthEmailLoginTokenV0(args: {
  token: string;
  now?: string;
  userAgent?: string | null;
  ip?: string | null;
  sessionTtlDays?: number;
}): Promise<{ account: DaaAuthAccountV0; session: DaaAuthSessionV0; sessionToken: string } | null> {
  const token = typeof args.token === "string" ? args.token.trim() : "";
  if (!token) return null;

  const tokenSha256 = sha256Hex(token);
  const now = typeof args.now === "string" && args.now.trim() ? args.now.trim() : nowIso();

  const userAgent = typeof args.userAgent === "string" ? args.userAgent.trim() : "";
  const ip = typeof args.ip === "string" ? args.ip.trim() : "";

  // Claim the token (single-use) and read the accountId in the same transaction.
  const accountId = await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    db.exec("BEGIN");
    try {
      const select = db.prepare(
        "SELECT t.account_id, t.expires_at, t.used_at, a.status FROM daa_auth_email_login_tokens t JOIN daa_auth_accounts a ON a.account_id = t.account_id WHERE t.token_sha256 = ? LIMIT 1"
      );
      let row: any = null;
      try {
        select.bind([tokenSha256]);
        if (select.step()) row = select.getAsObject();
      } finally {
        select.free();
      }

      if (!row) {
        db.exec("ROLLBACK");
        return null;
      }

      const usedAt = typeof row.used_at === "string" && row.used_at.trim() ? row.used_at.trim() : "";
      if (usedAt) {
        db.exec("ROLLBACK");
        return null;
      }

      const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
      if (!expiresAt || Date.parse(expiresAt) <= Date.parse(now)) {
        db.exec("ROLLBACK");
        return null;
      }

      const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
      if (status !== "active") {
        db.exec("ROLLBACK");
        return null;
      }

      const acct = typeof row.account_id === "string" ? row.account_id.trim() : "";
      if (!acct) {
        db.exec("ROLLBACK");
        return null;
      }

      const update = db.prepare(
        "UPDATE daa_auth_email_login_tokens SET used_at = ? WHERE token_sha256 = ? AND used_at IS NULL"
      );
      try {
        update.run([now, tokenSha256]);
      } finally {
        update.free();
      }

      db.exec("COMMIT");
      markDirty();
      return acct;
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  });

  if (!accountId) return null;

  // Create a normal cookie-backed session.
  const { session, token: sessionToken } = await createDaaAuthSessionV0({
    accountId,
    ttlDays: args.sessionTtlDays,
    userAgent: userAgent || null,
    ip: ip || null,
    createdAt: now,
  });

  const found = await getDaaAuthAccountBySessionTokenV0({ token: sessionToken, now, touch: false });
  if (!found) return null;

  return { account: found.account, session: found.session, sessionToken };
}

export async function requestDaaAuthEmailLoginV0(args: {
  email: string;
  userAgent?: string | null;
  ip?: string | null;
  ttlMinutes?: number;
}): Promise<{ ok: true; token: string | null; accountId: string | null }> {
  const email = normalizeEmailLoose(args.email);
  if (!email) return { ok: true, token: null, accountId: null };

  const account = await getDaaAuthAccountByUsernameV0(email).catch(() => null);
  if (!account || account.status !== "active") return { ok: true, token: null, accountId: null };

  const { token } = await createDaaAuthEmailLoginTokenV0({
    accountId: account.accountId,
    ttlMinutes: args.ttlMinutes,
    userAgent: args.userAgent ?? null,
    ip: args.ip ?? null,
  });

  return { ok: true, token, accountId: account.accountId };
}
