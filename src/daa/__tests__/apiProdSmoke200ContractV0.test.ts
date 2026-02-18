import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("mainline DOD prod smoke contract", () => {
  it("keeps /api/daa/engine-health route wired to health proxy contract", () => {
    const route = readRepoFile("app/api/daa/engine-health/route.ts");

    expect(route).toContain('upstreamPath: "/daa-api/health"');
    expect(route).toContain('method: "GET"');
    expect(route).toContain("isDaaEngineHealthResponse");
    expect(route).toContain("proxyToEngineJson");
  });

  it("keeps /daa/dashboard page entrypoint stable", () => {
    const page = readRepoFile("app/daa/dashboard/page.tsx");

    expect(page).toContain("export default function DaaDashboardPage()");
    expect(page).toContain("<Suspense");
    expect(page).toContain("DaaDashboardPageClient");
  });
});
