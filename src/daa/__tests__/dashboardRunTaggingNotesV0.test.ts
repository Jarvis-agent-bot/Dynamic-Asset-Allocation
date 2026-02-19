import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("dashboard run tagging+notes v0", () => {
  it("keeps run annotation UI wired in history/audit", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardHistoryAudit.tsx");

    expect(source).toContain("Run tags & notes");
    expect(source).toContain("run_annotation_v0");
    expect(source).toContain("Tags (comma-separated)");
    expect(source).toContain("Save tags/notes");
    expect(source).toContain("/annotation");
  });
});
