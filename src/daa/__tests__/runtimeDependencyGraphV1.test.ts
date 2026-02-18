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
  it("does not declare sqlite/sql.js packages in top-level dependencies", () => {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    expect(statSync(packageJsonPath).isFile()).toBe(true);
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      pnpm?: { overrides?: Record<string, string> };
    };

    const blocks = [pkg.dependencies, pkg.optionalDependencies, pkg.devDependencies, pkg.peerDependencies, pkg.pnpm?.overrides];
    for (const block of blocks) {
      const keys = Object.keys(block || {});
      expect(keys.some((k) => /^(sql\.js|sqljs|better-sqlite3|sqlite3|sqlite|@sqlite\.org\/sqlite-wasm)$/i.test(k))).toBe(false);
    }
  });

  it("does not lock sqlite/sql.js packages in pnpm lockfile", () => {
    const lockPath = path.resolve(process.cwd(), "pnpm-lock.yaml");
    expect(statSync(lockPath).isFile()).toBe(true);
    const lockText = readFileSync(lockPath, "utf8");

    expect(lockText).not.toMatch(/\/sql\.js@/i);
    expect(lockText).not.toMatch(/\/sqljs@/i);
    expect(lockText).not.toMatch(/\/better-sqlite3@/i);
    expect(lockText).not.toMatch(/\/sqlite3@/i);
    expect(lockText).not.toMatch(/\/sqlite@/i);
    expect(lockText).not.toMatch(/\/@sqlite\.org\/sqlite-wasm@/i);
  });

  it("does not import sql.js/sqlite runtime packages in Next DAA server paths", () => {
    const roots = [path.resolve(process.cwd(), "src/daa"), path.resolve(process.cwd(), "app/api/daa")];
    const forbidden = /\b(sql\.js|sqljs|better-sqlite3|sqlite3|@sqlite\.org\/sqlite-wasm|initSqlJs)\b/i;

    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of listRuntimeCodeFiles(root)) {
        const text = readFileSync(file, "utf8");
        if (forbidden.test(text)) offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps pg-mem wiring isolated to daaPgV0 test shim", () => {
    const roots = [path.resolve(process.cwd(), "src/daa"), path.resolve(process.cwd(), "app/api/daa")];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of listRuntimeCodeFiles(root)) {
        const rel = path.relative(process.cwd(), file);
        if (rel === "src/daa/pg/daaPgV0.ts") continue;
        const text = readFileSync(file, "utf8");
        if (/\bpg-mem\b/i.test(text)) offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
