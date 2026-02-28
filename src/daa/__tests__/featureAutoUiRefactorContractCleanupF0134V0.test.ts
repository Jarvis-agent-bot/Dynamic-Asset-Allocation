import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("feature-auto-ui-refactor-contract-cleanup-f0134-v0", () => {
  it("keeps settings/dashboard route-parity copy explicit for legacy /daa/settings redirects", () => {
    const file = resolve(process.cwd(), "app/daa/dashboard/_tabs/DaaSettingsTab.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("Legacy <code className=\"rounded bg-muted px-1 py-0.5\">/daa/settings</code> paths are normalized into this route for parity");
  });
});
