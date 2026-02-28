import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("feature-auto-dead-code-contract-cleanup-f0135-v0", () => {
  it("keeps deprecated route cleanup wording aligned with canonical dashboard tabs", () => {
    const file = resolve(process.cwd(), "app/daa/dashboard/_tabs/DaaSettingsTab.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("removed legacy surfaces like <code className=\"rounded bg-muted px-1 py-0.5\">/daa/wizard</code> are redirected to canonical dashboard tabs.");
  });
});
