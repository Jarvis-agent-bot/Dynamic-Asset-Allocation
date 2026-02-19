import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("run incident playbooks v0", () => {
  it("keeps failed-run incident playbook with recovery flow actions", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanel.tsx");

    expect(source).toContain("Incident playbook (failed run)");
    expect(source).toContain("1) Capture state:");
    expect(source).toContain("2) Contain risk:");
    expect(source).toContain("3) Recover:");
    expect(source).toContain("Run guided recovery");
  });
});
