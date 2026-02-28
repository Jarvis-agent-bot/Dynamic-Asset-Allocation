import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("daa command palette v0", () => {
  it("drops legacy command palette/action-rail from dashboard page", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardPageClient.tsx");

    expect(source).not.toContain("DAA command palette");
    expect(source).not.toContain("Cmd/Ctrl+K");
    expect(source).not.toContain("Open command palette");
    expect(source).not.toContain("commandPaletteFilteredV0");
    expect(source).toContain("DaaUnifiedArchitectureTab");
    expect(source).toContain('return "unified-core"');
  });
});
