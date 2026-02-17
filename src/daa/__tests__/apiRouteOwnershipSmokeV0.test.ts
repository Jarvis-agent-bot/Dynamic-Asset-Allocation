import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function listRouteFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [rootDir];

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === "route.ts" || entry.name === "route.js") out.push(full);
    }
  }

  return out;
}

describe("DAA public API route ownership smoke (Next.js-only)", () => {
  it("keeps public /api/daa routes in Next.js app router", () => {
    const nextApiRoot = path.resolve(process.cwd(), "app/api/daa");
    const routeFiles = listRouteFiles(nextApiRoot).map((f) => path.relative(process.cwd(), f));

    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it("keeps FastAPI engine-only and refuses legacy public /api/daa enable flag", () => {
    const fastApiMainPath = path.resolve(process.cwd(), "services/daa-py/app/main.py");
    const text = readFileSync(fastApiMainPath, "utf8");

    expect(text).toContain('os.environ.get("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES", "0") == "1"');
    expect(text).toContain("raise RuntimeError");
    expect(text).not.toContain("app.include_router(auth_v0_router)");
    expect(text).not.toContain("app.include_router(store_v0_router)");
  });

  it("keeps Nginx routing /api/daa to Next.js instead of FastAPI", () => {
    const nginxSnippetPath = path.resolve(process.cwd(), "deploy/nginx-daa-api-snippet.conf");
    const text = readFileSync(nginxSnippetPath, "utf8");

    expect(text).toMatch(/location\s+\^~\s+\/api\/daa\//);
    expect(text).toMatch(/location\s+\^~\s+\/api\/daa\/[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:3000/);
    expect(text).toMatch(/location\s+\^~\s+\/daa-api\/[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:18000/);
  });
});
