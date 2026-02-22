import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("daily ops speed-to-action v0", () => {
  it("keeps fast path run+preflight actions in funds hub", () => {
    const source = readRepoFile("app/daa/market/funds/_components/DaaRebalancePanelHeaderActionsV0.tsx");

    expect(source).toContain("Run + preflight");
    expect(source).toContain("Run+checklist");
    expect(source).toContain("Fast path: run DAA refresh/recommendation, then open preflight checklist.");
  });
});
