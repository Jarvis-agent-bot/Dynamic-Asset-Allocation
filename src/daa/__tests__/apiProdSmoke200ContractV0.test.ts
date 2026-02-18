import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("mainline DOD prod smoke contract", () => {
  it("keeps /api/daa/engine-health route wired for a successful health pass-through", () => {
    const route = readRepoFile("app/api/daa/engine-health/route.ts");

    expect(route).toContain("export async function GET()");
    expect(route).not.toContain('export const runtime = "edge"');
    expect(route).toContain('upstreamPath: "/daa-api/health"');
    expect(route).toContain('method: "GET"');
    expect(route).toContain('import { parsePositiveIntEnv } from "@/src/daa/env"');
    expect(route).toContain('import { proxyToEngineJson } from "@/src/daa/proxyToEngine"');
    expect(route).toContain('import { isDaaEngineHealthResponse } from "@/src/core/contracts/daaEngine"');
    expect(route).toContain("isDaaEngineHealthResponse");
    expect(route).toContain("proxyToEngineJson");
    expect(route).toContain('parsePositiveIntEnv("DAA_ENGINE_TIMEOUT_MS", 10_000)');
    expect(route).toContain('validate: isDaaEngineHealthResponse');
    expect(route).toContain('fallbackContentType: "application/json"');
  });

  it("keeps /daa/dashboard page entrypoint renderable (not redirect/notFound)", () => {
    const page = readRepoFile("app/daa/dashboard/page.tsx");

    expect(page).toContain("export default function DaaDashboardPage()");
    expect(page).toContain("<Suspense");
    expect(page).toContain("DaaDashboardPageClient");
    expect(page).toContain("DaaDashboardSkeleton");
    expect(page).toContain("<DaaDashboardPageClient />");
    expect(page).toContain("fallback={<DaaDashboardSkeleton />}");
    expect(page).not.toContain("redirect(");
    expect(page).not.toContain("notFound(");
  });
});
