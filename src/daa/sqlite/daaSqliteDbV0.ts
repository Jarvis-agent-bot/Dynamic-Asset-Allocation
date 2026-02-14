import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSqlJsStaticV0 } from "./sqljsNodeV0";
import { DAA_SQLITE_MIGRATIONS_V0 } from "./migrationsV0";

import type { Database } from "sql.js";

type DbStateV0 = {
  init: Promise<{ db: Database; dbPath: string }> | null;
  db: Database | null;
  dbPath: string | null;
  dirty: boolean;
  lock: Promise<void>;
};

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

function getState(): DbStateV0 {
  const g: any = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      init: null,
      db: null,
      dbPath: null,
      dirty: false,
      lock: Promise.resolve(),
    } satisfies DbStateV0;
  }
  return g[GLOBAL_KEY] as DbStateV0;
}

function nowIso() {
  return new Date().toISOString();
}

function getDbPathV0(): string {
  const raw = process.env.DAA_SQLITE_PATH;
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  // Default to a local path that works in Docker/VPS deployments.
  return path.join(process.cwd(), ".data", "daa.sqlite");
}

function applyMigrationsV0(db: Database): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);"
  );

  const rows = db.exec("SELECT id FROM schema_migrations ORDER BY id");
  const applied = new Set<string>();
  if (rows.length && rows[0]?.values) {
    for (const v of rows[0].values) {
      const id = typeof v?.[0] === "string" ? v[0] : String(v?.[0] ?? "");
      if (id) applied.add(id);
    }
  }

  const newlyApplied: string[] = [];
  for (const m of DAA_SQLITE_MIGRATIONS_V0) {
    if (applied.has(m.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      const stmt = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");
      try {
        stmt.run([m.id, nowIso()]);
      } finally {
        stmt.free();
      }
      db.exec("COMMIT");
      newlyApplied.push(m.id);
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  }

  return newlyApplied;
}

async function openDbOnceV0(): Promise<{ db: Database; dbPath: string }> {
  const SQL = await getSqlJsStaticV0();
  const dbPath = getDbPathV0();

  await mkdir(path.dirname(dbPath), { recursive: true });

  let db: Database;
  try {
    const raw = await readFile(dbPath);
    db = new SQL.Database(new Uint8Array(raw));
  } catch {
    db = new SQL.Database();
  }

  // Enforce FK constraints for cascades.
  db.exec("PRAGMA foreign_keys=ON;");

  const newlyApplied = applyMigrationsV0(db);
  if (newlyApplied.length) {
    // Persist DDL + schema_migrations so a "migrations-only" boot doesn't lose state.
    await flushDbToDiskV0(db, dbPath);
    console.info(`[daa_sqlite] applied migrations: ${newlyApplied.join(", ")}`);
  }

  return { db, dbPath };
}

async function flushDbToDiskV0(db: Database, dbPath: string) {
  const dir = path.dirname(dbPath);
  const tmp = path.join(dir, `${path.basename(dbPath)}.tmp`);

  const data = db.export();
  await writeFile(tmp, data);
  await rename(tmp, dbPath);
}

export async function withDaaSqliteDbV0<T>(
  fn: (ctx: { db: Database; markDirty: () => void }) => Promise<T> | T
): Promise<T> {
  const state = getState();

  // Serialize all DB interactions in-process to avoid interleaving exports.
  let out!: T;
  let err: any = null;

  state.lock = state.lock.then(async () => {
    try {
      if (!state.db) {
        state.init ||= openDbOnceV0();
        const ready = await state.init;
        state.db = ready.db;
        state.dbPath = ready.dbPath;
      }

      const res = await fn({
        db: state.db,
        markDirty: () => {
          state.dirty = true;
        },
      });

      if (state.dirty && state.db && state.dbPath) {
        await flushDbToDiskV0(state.db, state.dbPath);
        state.dirty = false;
      }

      out = res;
    } catch (e) {
      err = e;
    }
  });

  await state.lock;
  if (err) throw err;
  return out;
}
