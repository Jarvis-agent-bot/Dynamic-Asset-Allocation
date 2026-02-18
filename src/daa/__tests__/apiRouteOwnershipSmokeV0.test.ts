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

  it("keeps FastAPI source free of public /api/daa router prefixes", () => {
    const fastApiAppRoot = path.resolve(process.cwd(), "services/daa-py/app");
    const routeFiles = listRouteFiles(fastApiAppRoot);

    for (const filePath of routeFiles) {
      const text = readFileSync(filePath, "utf8");
      expect(text).not.toContain('prefix="/api/daa');
      expect(text).not.toContain("prefix='/api/daa");
    }
  });

  it("keeps Nginx routing /api/daa to Next.js instead of FastAPI", () => {
    const nginxSnippetPath = path.resolve(process.cwd(), "deploy/nginx-daa-api-snippet.conf");
    const text = readFileSync(nginxSnippetPath, "utf8");

    expect(text).toMatch(/location\s+\^~\s+\/api\/daa\//);
    expect(text).toMatch(/location\s+\^~\s+\/api\/daa\/[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:3000/);
    expect(text).toMatch(/location\s+\^~\s+\/daa-api\/[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:18000/);
    expect(text).toContain("IMPORTANT: without this, /api/* may be routed elsewhere on the VPS and the v0 UI will 404.");
    expect(text).toContain("Step4/5 UI can call POST /api/daa/rebalance/simulate");
    expect(text).toContain("/api/daa/* -> Next.js API routes");
    expect(text).toContain("/daa-api/* -> Python engine");
  });

  it("keeps compose/docs aligned with engine-only Python service", () => {
    const composePath = path.resolve(process.cwd(), "docker-compose.yml");
    const composeText = readFileSync(composePath, "utf8");
    const deployReadmePath = path.resolve(process.cwd(), "deploy/README.md");
    const deployReadmeText = readFileSync(deployReadmePath, "utf8");

    expect(composeText).not.toContain("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=1");
    expect(composeText).toContain("daa-api:");
    expect(composeText).toContain("DAA_PY_BASE_URL=http://daa-api:8000");
    expect(composeText).not.toMatch(/daa-web:[\s\S]*?depends_on:[\s\S]*?-\s+daa-api/);
    expect(deployReadmeText).toContain("/api/daa/*");
    expect(deployReadmeText).toContain("/api/daa/` → http://127.0.0.1:3000/api/daa/");
    expect(deployReadmeText).toContain("/daa-api/");
    expect(deployReadmeText).toContain("owned by Next.js");
    expect(deployReadmeText).toContain("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=0");
    expect(deployReadmeText).toContain("Optional (legacy override): `DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=1`");
  });
});
