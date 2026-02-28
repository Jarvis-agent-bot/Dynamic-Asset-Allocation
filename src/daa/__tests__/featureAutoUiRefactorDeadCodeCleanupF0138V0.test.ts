import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("feature-auto-ui-refactor-dead-code-cleanup-f0138-v0", () => {
  it("uses consolidated button hierarchy for signed-in login controls", () => {
    const file = resolve(process.cwd(), "app/daa/login/_components/DaaLoginClient.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("variant=\"secondary\" onClick={() => void refreshSession()}");
    expect(source).toContain("variant=\"ghost\" onClick={() => void logout()}");
  });
});
