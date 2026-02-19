import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("daa command palette v0", () => {
  it("keeps command palette shortcuts and quick actions", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardPageClient.tsx");

    expect(source).toContain("DAA command palette");
    expect(source).toContain("Cmd/Ctrl+K");
    expect(source).toContain("Open command palette");
    expect(source).toContain("Type a command (jump/open)");
    expect(source).toContain("commandPaletteFilteredV0");
  });
});
