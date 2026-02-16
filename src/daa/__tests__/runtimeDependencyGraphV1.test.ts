import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function listRuntimeCodeFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [rootDir];

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      out.push(full);
    }
  }

  return out;
}

describe("DAA runtime dependency guard (sql.js removal)", () => {
  it("does not declare sql.js runtime dependency", () => {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    expect(statSync(packageJsonPath).isFile()).toBe(true);
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.["sql.js"]).toBeUndefined();
    expect(pkg.optionalDependencies?.["sql.js"]).toBeUndefined();
  });

  it("does not import sql.js/sqlite runtime packages in Next DAA server paths", () => {
    const roots = [path.resolve(process.cwd(), "src/daa"), path.resolve(process.cwd(), "app/api/daa")];
    const forbidden = /\b(sql\.js|sqljs|better-sqlite3|sqlite3|initSqlJs)\b/i;

    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of listRuntimeCodeFiles(root)) {
        const text = readFileSync(file, "utf8");
        if (forbidden.test(text)) offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
