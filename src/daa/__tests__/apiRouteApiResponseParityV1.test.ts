import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function listRouteFiles(rootRel: string): string[] {
  const root = path.resolve(process.cwd(), rootRel);
  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (entry.isFile() && entry.name === "route.ts") {
        results.push(path.relative(process.cwd(), abs));
      }
    }
  }

  walk(root);
  return results.sort();
}

describe("api-route-api-response-parity-v1", () => {
  it("/api/daa 路由不再直接输出 legacy NextResponse JSON 或原始 denied 响应", () => {
    const routes = listRouteFiles("app/api/daa");
    const offenders: string[] = [];

    for (const rel of routes) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      if (
        /NextResponse\.json\(/.test(source)
        || /function json\(data: unknown/.test(source)
        || /const denied = await requireDaaAdmin/.test(source)
      ) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
