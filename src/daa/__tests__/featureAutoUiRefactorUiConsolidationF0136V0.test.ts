import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("feature-auto-ui-refactor-ui-consolidation-f0136-v0", () => {
  it("uses shared Alert primitives for the dev/test default-account hint", () => {
    const file = resolve(process.cwd(), "app/daa/login/_components/DaaLoginClient.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("<AlertTitle>本地默认账号</AlertTitle>");
    expect(source).toContain("<AlertDescription>");
  });
});
