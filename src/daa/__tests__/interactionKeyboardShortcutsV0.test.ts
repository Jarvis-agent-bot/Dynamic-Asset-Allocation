import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("interaction keyboard shortcuts v0", () => {
  it("removes legacy action-rail keyboard shortcuts from dashboard page", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardPageClient.tsx");

    expect(source).not.toContain("quickFilterInputRef");
    expect(source).not.toContain("if (ev.key === \"/\" && !isTyping)");
    expect(source).not.toContain("if (ev.key === \"1\")");
    expect(source).not.toContain("if (ev.key === \"2\")");
    expect(source).not.toContain("Shortcuts:");
    expect(source).not.toContain("Alt+1");
    expect(source).not.toContain("Alt+2");
    expect(source).toContain("window.addEventListener(\"focus\", onFocus)");
  });
});
