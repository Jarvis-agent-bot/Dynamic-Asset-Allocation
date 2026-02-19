import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("self-serve run debugger v0", () => {
  it("keeps run debugger panel with diagnostics and guided recovery actions", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Run debugger");
    expect(source).toContain("One-click diagnostics + guided recovery actions");
    expect(source).toContain("Fix targets");
    expect(source).toContain("Refresh prices");
    expect(source).toContain("Open guided recovery");
    expect(source).toContain("Copy diagnostics");
  });
});
