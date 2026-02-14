import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { withDaaSqliteDbV0 } from "../daaSqliteDbV0";
import { DAA_SQLITE_MIGRATIONS_V0 } from "../migrationsV0";

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

async function resetDbFile(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  await rm(dbPath + ".tmp", { force: true });
  delete (globalThis as any)[GLOBAL_KEY];
}

describe("daa/sqlite migrations audit v0", () => {
  it("writes one audit event per applied migration (first boot only)", async () => {
    const dbPath = path.join(
      process.cwd(),
      ".vitest-tmp",
      `daa-mig-audit-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    await withDaaSqliteDbV0(({ db }) => {
      const rows = db.exec("SELECT COUNT(*) AS c FROM schema_migration_audit_events");
      const c = Number(rows?.[0]?.values?.[0]?.[0] ?? 0);
      expect(c).toBe(DAA_SQLITE_MIGRATIONS_V0.length);
    });

    // Prove it does not duplicate on re-open.
    delete (globalThis as any)[GLOBAL_KEY];

    await withDaaSqliteDbV0(({ db }) => {
      const rows = db.exec("SELECT COUNT(*) AS c FROM schema_migration_audit_events");
      const c = Number(rows?.[0]?.values?.[0]?.[0] ?? 0);
      expect(c).toBe(DAA_SQLITE_MIGRATIONS_V0.length);
    });

    await resetDbFile(dbPath);
  });
});
