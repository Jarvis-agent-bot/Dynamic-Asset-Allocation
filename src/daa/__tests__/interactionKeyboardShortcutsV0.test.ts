import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("interaction keyboard shortcuts v0", () => {
  it("keeps dashboard action-rail keyboard shortcuts wired", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardPageClient.tsx");

    expect(source).toContain("quickFilterInputRef");
    expect(source).toContain("if (ev.key === \"/\" && !isTyping)");
    expect(source).toContain("if (ev.key === \"1\")");
    expect(source).toContain("if (ev.key === \"2\")");
    expect(source).toContain("Shortcuts:");
    expect(source).toContain("Alt+1");
    expect(source).toContain("Alt+2");
  });
});
