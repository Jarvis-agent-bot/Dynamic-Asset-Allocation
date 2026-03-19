/**
 * secretsManager.ts
 *
 * Encrypted secrets storage with env-var-first resolution.
 * Priority: env var > DB (encrypted) > empty
 *
 * Encryption: AES-256-GCM with per-entry random IV.
 * Key source: DAA_SECRETS_ENCRYPTION_KEY env var, or derived from DAA_DB_URL.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { daaPgPool } from "@/src/daa/pg/daaPg";

// ─────────────────────────────────────────────────────────────────────────────
// Secret key definitions
// ─────────────────────────────────────────────────────────────────────────────

export const SECRET_KEY_DEFS_ = [
  { key: "llm_api_key", label: "LLM API Key", group: "llm", envVars: ["DAA_LLM_API_KEY", "OPENAI_API_KEY"], sensitive: true },
  { key: "llm_endpoint", label: "LLM Endpoint", group: "llm", envVars: ["DAA_LLM_ENDPOINT"], sensitive: false },
  { key: "llm_model", label: "LLM Model", group: "llm", envVars: ["DAA_LLM_MODEL"], sensitive: false },
  { key: "broker_mode", label: "Broker Mode", group: "broker", envVars: ["DAA_BROKER_MODE"], sensitive: false },
  { key: "ibkr_web_api_base_url", label: "IBKR Web API Base URL", group: "broker", envVars: ["IBKR_WEB_API_BASE_URL", "DAA_IBKR_WEB_API_BASE_URL"], sensitive: false },
  { key: "ibkr_account_id", label: "IBKR Account ID", group: "broker", envVars: ["IBKR_ACCOUNT_ID", "DAA_IBKR_ACCOUNT_ID"], sensitive: false },
  { key: "ibkr_web_api_session_cookie", label: "IBKR Session Cookie", group: "broker", envVars: ["IBKR_WEB_API_SESSION_COOKIE", "DAA_IBKR_WEB_API_SESSION_COOKIE"], sensitive: true },
  { key: "ibkr_web_api_oauth_token", label: "IBKR OAuth Token", group: "broker", envVars: ["IBKR_WEB_API_OAUTH_TOKEN", "DAA_IBKR_WEB_API_OAUTH_TOKEN"], sensitive: true },
  { key: "ibkr_web_api_csrf_token", label: "IBKR CSRF Token", group: "broker", envVars: ["IBKR_WEB_API_CSRF_TOKEN", "DAA_IBKR_WEB_API_CSRF_TOKEN"], sensitive: true },
  { key: "telegram_bot_token", label: "Telegram Bot Token", group: "telegram", envVars: ["TELEGRAM_BOT_TOKEN", "DAA_TELEGRAM_BOT_TOKEN"], sensitive: true },
  { key: "telegram_chat_id", label: "Telegram Chat ID", group: "telegram", envVars: ["TELEGRAM_CHAT_ID", "DAA_TELEGRAM_CHAT_ID"], sensitive: false },
  { key: "telegram_webhook_secret", label: "Telegram Webhook Secret", group: "telegram", envVars: ["TELEGRAM_WEBHOOK_SECRET", "DAA_TELEGRAM_WEBHOOK_SECRET"], sensitive: true },
  { key: "telegram_allowlist", label: "Telegram Allowlist", group: "telegram", envVars: ["TELEGRAM_ALLOWLIST", "DAA_TELEGRAM_ALLOWLIST"], sensitive: false },
  { key: "feishu_webhook_url", label: "Feishu Webhook URL", group: "feishu", envVars: ["FEISHU_WEBHOOK_URL", "DAA_FEISHU_WEBHOOK_URL"], sensitive: true },
  { key: "supabase_service_role_key", label: "Supabase Service Role Key", group: "supabase", envVars: ["SUPABASE_SERVICE_ROLE_KEY"], sensitive: true },
  { key: "supabase_url", label: "Supabase URL", group: "supabase", envVars: ["NEXT_PUBLIC_SUPABASE_URL"], sensitive: false, readOnly: true },
  { key: "supabase_publishable_key", label: "Supabase Publishable Key", group: "supabase", envVars: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], sensitive: false, readOnly: true },
  { key: "cron_token", label: "Cron Token", group: "cron", envVars: ["DAA_CRON_TOKEN", "CRON_SECRET"], sensitive: true },
] as const;

export type DaaSecretKey = (typeof SECRET_KEY_DEFS_)[number]["key"];

export type DaaSecretStatus = {
  key: DaaSecretKey;
  label: string;
  group: string;
  masked: string;
  source: "env" | "db" | "empty";
  sensitive: boolean;
  readOnly: boolean;
  updatedAt: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Encryption
// ─────────────────────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // NIST SP 800-38D recommends 96-bit (12-byte) IV for GCM
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function deriveEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const explicit = (process.env.DAA_SECRETS_ENCRYPTION_KEY || "").trim();
  if (explicit) {
    cachedKey = createHash("sha256").update(explicit).digest();
    return cachedKey;
  }

  const dbUrl = (process.env.DAA_DB_URL || "").trim();
  if (!dbUrl) {
    console.warn("[secretsManager] DAA_SECRETS_ENCRYPTION_KEY 和 DAA_DB_URL 均未设置，使用固定密钥加密。建议在生产环境中配置 DAA_SECRETS_ENCRYPTION_KEY。");
  }
  cachedKey = createHash("sha256").update(`daa-secrets:${dbUrl || "daa-secrets-default-key"}`).digest();
  return cachedKey;
}

function encrypt(plaintext: string): { ciphertext: string; iv: string } {
  const key = deriveEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

function decrypt(ciphertext: string, ivBase64: string): string {
  const key = deriveEncryptionKey();
  const iv = Buffer.from(ivBase64, "base64");
  const data = Buffer.from(ciphertext, "base64");
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(0, data.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Masking
// ─────────────────────────────────────────────────────────────────────────────

function maskValue(value: string, sensitive: boolean): string {
  if (!value) return "";
  if (!sensitive) {
    if (value.length <= 20) return value;
    return value.slice(0, 12) + "****" + value.slice(-4);
  }
  if (value.length <= 4) return "****";
  return value.slice(0, 3) + "****" + value.slice(-4);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB operations
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSecretsTable(): Promise<void> {
  const pool = daaPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daa_secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      iv TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

let secretsTableReady: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (!secretsTableReady) {
    secretsTableReady = ensureSecretsTable().catch((err) => {
      secretsTableReady = null;
      throw err;
    });
  }
  return secretsTableReady;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — resolve (env > db)
// ─────────────────────────────────────────────────────────────────────────────

function resolveFromEnv(envVars: readonly string[]): string {
  for (const envVar of envVars) {
    const value = (process.env[envVar] || "").trim();
    if (value) return value;
  }
  return "";
}

/** Resolve a single secret value. Priority: env var > DB > empty. */
export async function resolveSecret(key: DaaSecretKey): Promise<string> {
  const def = SECRET_KEY_DEFS_.find((d) => d.key === key);
  if (!def) return "";

  // env var takes priority
  const envValue = resolveFromEnv(def.envVars);
  if (envValue) return envValue;

  // read-only keys (NEXT_PUBLIC_*) can't be stored in DB
  if ("readOnly" in def && def.readOnly) return "";

  // try DB
  try {
    await ensureReady();
    const pool = daaPgPool();
    const result = await pool.query(
      "SELECT value, iv FROM daa_secrets WHERE key = $1 LIMIT 1",
      [key],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0] as { value: string; iv: string };
      return decrypt(row.value, row.iv);
    }
  } catch {
    // DB not available — fall through
  }

  return "";
}

/** Get status of all secrets (masked values + source). */
export async function listSecretStatuses(): Promise<DaaSecretStatus[]> {
  // Load all DB secrets at once
  let dbRows: Map<string, { value: string; iv: string; updated_at: string }> = new Map();
  try {
    await ensureReady();
    const pool = daaPgPool();
    const result = await pool.query("SELECT key, value, iv, updated_at FROM daa_secrets");
    for (const row of result.rows) {
      const r = row as { key: string; value: string; iv: string; updated_at: string };
      dbRows.set(r.key, r);
    }
  } catch {
    // DB not available
  }

  return SECRET_KEY_DEFS_.map((def) => {
    const envValue = resolveFromEnv(def.envVars);
    const isReadOnly = "readOnly" in def && def.readOnly;

    if (envValue) {
      return {
        key: def.key,
        label: def.label,
        group: def.group,
        masked: maskValue(envValue, def.sensitive),
        source: "env" as const,
        sensitive: def.sensitive,
        readOnly: Boolean(isReadOnly),
        updatedAt: null,
      };
    }

    const dbRow = dbRows.get(def.key);
    if (dbRow) {
      let plaintext = "";
      try {
        plaintext = decrypt(dbRow.value, dbRow.iv);
      } catch {
        // decryption failed — treat as empty
      }
      if (plaintext) {
        return {
          key: def.key,
          label: def.label,
          group: def.group,
          masked: maskValue(plaintext, def.sensitive),
          source: "db" as const,
          sensitive: def.sensitive,
          readOnly: Boolean(isReadOnly),
          updatedAt: dbRow.updated_at,
        };
      }
    }

    return {
      key: def.key,
      label: def.label,
      group: def.group,
      masked: "",
      source: "empty" as const,
      sensitive: def.sensitive,
      readOnly: Boolean(isReadOnly),
      updatedAt: null,
    };
  });
}

/** Write a secret to DB (encrypted). */
export async function writeSecret(key: DaaSecretKey, value: string): Promise<void> {
  const def = SECRET_KEY_DEFS_.find((d) => d.key === key);
  if (!def) throw new Error(`unknown secret key: ${key}`);
  if ("readOnly" in def && def.readOnly) throw new Error(`secret ${key} is read-only`);

  await ensureReady();
  const pool = daaPgPool();

  const trimmed = value.trim();
  if (!trimmed) {
    // empty value = delete
    await pool.query("DELETE FROM daa_secrets WHERE key = $1", [key]);
    return;
  }

  const { ciphertext, iv } = encrypt(trimmed);
  await pool.query(
    `INSERT INTO daa_secrets (key, value, iv, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, iv = $3, updated_at = NOW()`,
    [key, ciphertext, iv],
  );
}

/** Delete a secret from DB. */
export async function deleteSecret(key: DaaSecretKey): Promise<void> {
  const def = SECRET_KEY_DEFS_.find((d) => d.key === key);
  if (!def) throw new Error(`unknown secret key: ${key}`);
  if ("readOnly" in def && def.readOnly) throw new Error(`secret ${key} is read-only`);

  await ensureReady();
  const pool = daaPgPool();
  await pool.query("DELETE FROM daa_secrets WHERE key = $1", [key]);
}
