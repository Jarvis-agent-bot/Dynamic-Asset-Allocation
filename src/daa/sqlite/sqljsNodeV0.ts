import type { SqlJsStatic } from "sql.js";

// Use the ASM.js build to avoid bundler/webpack WebAssembly config.
// This is slower than WASM, but keeps the Next.js build pipeline simple.
import initSqlJs from "sql.js/dist/sql-asm.js";

let cached: Promise<SqlJsStatic> | null = null;

export async function getSqlJsStaticV0(): Promise<SqlJsStatic> {
  if (cached) return cached;
  cached = initSqlJs() as Promise<SqlJsStatic>;
  return cached;
}
