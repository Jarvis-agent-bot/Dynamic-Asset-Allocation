import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("dashboard run list search/sort v0", () => {
  it("keeps run search and sort controls wired to runs query", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardHistoryAudit.tsx");

    expect(source).toContain("Search runId / kind / status / actor / source");
    expect(source).toContain("qs.set(\"q\", runSearchText.trim())");
    expect(source).toContain("qs.set(\"sort\", runSort)");
    expect(source).toContain("Newest first");
    expect(source).toContain("Oldest first");
    expect(source).toContain("Status");
    expect(source).toContain("Errors only");
    expect(source).toContain("Dashboard only");
    expect(source).toContain("qs.set(\"status\", runStatusFilter)");
  });
});
