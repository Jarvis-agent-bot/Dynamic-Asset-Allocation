import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("DAA Postgres-only persistence guard", () => {
  it("keeps auth/store/admin persistence modules free of sqlite/sql.js runtime paths", () => {
    const files = [
      "src/daa/storeV0.ts",
      "src/daa/adminUserStatusStoreV0.ts",
      "src/daa/auth/daaAuthStoreV0.ts",
      "src/daa/auth/daaAuthEmailLoginStoreV0.ts",
    ];

    const forbidden = /\b(sqlite|better-sqlite3|sql\.js|sqljs|initSqlJs)\b/i;
    const offenders: string[] = [];

    for (const rel of files) {
      if (forbidden.test(readRepoFile(rel))) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  it("routes canonical store and admin exports through pg implementations", () => {
    const store = readRepoFile("src/daa/storeV0.ts");
    const admin = readRepoFile("src/daa/adminUserStatusStoreV0.ts");

    expect(store).toMatch(/from\s+"\.\/pg\/daaStorePgV0"/);
    expect(admin).toMatch(/from\s+"\.\/pg\/daaAdminUserStatusStoreV0"/);
  });
});
