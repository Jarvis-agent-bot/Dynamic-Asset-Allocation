/**
 * Shared DB helpers and utilities used across domain stores.
 */

import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { normalizeText, toFinite, normalizeUpper } from "@/src/daa/utils/normalize";
export { normalizeText, toFinite, normalizeUpper };
export { toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";

/* ------------------------------------------------------------------ */
/*  Query function type used in transactions                          */
/* ------------------------------------------------------------------ */

type DaaQueryRowResult = { rows: Array<Record<string, unknown>> };
export type DaaTxQueryFn = (sql: string, params?: unknown[]) => Promise<DaaQueryRowResult>;

export type SchemaQueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;

/* ------------------------------------------------------------------ */
/*  JSON / boolean / ISO helpers                                      */
/* ------------------------------------------------------------------ */

export function parseJsonb<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch (err) {
      logSwallowed("storeShared.parseJsonb", err);
      return fallback;
    }
  }
  if (typeof v === "object") return v as T;
  return fallback;
}

export function toBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const text = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(text)) return true;
    if (["0", "false", "no", "off"].includes(text)) return false;
  }
  return fallback;
}

export function toIsoString(v: unknown, fallback = "1970-01-01T00:00:00.000Z"): string {
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? new Date(v).toISOString() : fallback;
  }
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) return fallback;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return fallback;
  return new Date(ms).toISOString();
}

export function toNullableNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function toIsoStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const result = toIsoString(v, "");
  return result || null;
}

/* ------------------------------------------------------------------ */
/*  Schema inspection helpers                                         */
/* ------------------------------------------------------------------ */

export async function hasTable(query: SchemaQueryFn, tableName: string): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = CURRENT_SCHEMA()
       AND table_name = $1
     LIMIT 1`,
    [tableName.toLowerCase()],
  );
  return result.rows.length > 0;
}

export async function hasTableColumn(query: SchemaQueryFn, tableName: string, columnName: string): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2
     LIMIT 1`,
    [tableName.toLowerCase(), columnName.toLowerCase()],
  );
  return result.rows.length > 0;
}

/**
 * 对 SQL 标识符进行转义（表名、列名），防止 SQL 注入。
 * 使用 PostgreSQL 双引号规则：内部双引号替换为两个双引号。
 */
function quoteIdent(name: string): string {
  const sanitized = name.replace(/"/g, '""');
  return `"${sanitized}"`;
}

function buildLegacyTableName(tableName: string): string {
  return `${normalizeText(tableName).toLowerCase()}_archived_v1`;
}

export async function archiveTableToLegacy(query: SchemaQueryFn, tableName: string): Promise<boolean> {
  const normalized = normalizeText(tableName).toLowerCase();
  if (!normalized) return false;
  if (!(await hasTable(query, normalized))) return false;
  const legacyTableName = buildLegacyTableName(normalized);
  if (await hasTable(query, legacyTableName)) {
    throw new Error(`legacy table already exists: ${legacyTableName}`);
  }
  await query(`ALTER TABLE ${quoteIdent(normalized)} RENAME TO ${quoteIdent(legacyTableName)}`);
  return true;
}

export async function ensureTableColumn(
  query: SchemaQueryFn,
  tableName: string,
  columnName: string,
  definitionSql: string,
): Promise<void> {
  if (await hasTableColumn(query, tableName, columnName)) return;
  // definitionSql 是开发者硬编码的类型定义（如 "TEXT DEFAULT ''"），无需转义
  await query(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${quoteIdent(columnName)} ${definitionSql}`);
}

/* ------------------------------------------------------------------ */
/*  Pg error helpers                                                  */
/* ------------------------------------------------------------------ */

export function isPgUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
}

export function isMissingRelationError(error: unknown, relation: string): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return false;
  const escaped = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`relation\\s+["']?${escaped}["']?\\s+does\\s+not\\s+exist`, "i").test(message);
}

/* ------------------------------------------------------------------ */
/*  Transaction wrapper                                               */
/* ------------------------------------------------------------------ */

export async function withPgTransaction<T>(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  await query("BEGIN");
  try {
    const result = await fn();
    await query("COMMIT");
    return result;
  } catch (error) {
    try {
      await query("ROLLBACK");
    } catch (err) {
      logSwallowed("storeShared.rollback", err);
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/*  Misc shared helpers                                               */
/* ------------------------------------------------------------------ */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}
