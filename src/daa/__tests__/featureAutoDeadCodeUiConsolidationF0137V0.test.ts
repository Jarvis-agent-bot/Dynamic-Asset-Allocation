import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("feature-auto-dead-code-ui-consolidation-f0137-v0", () => {
  it("uses shared Alert primitives for the login support hint", () => {
    const file = resolve(process.cwd(), "app/daa/login/_components/DaaLoginClient.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("<AlertTitle>Need help?</AlertTitle>");
    expect(source).toContain("<Link className=\"underline underline-offset-2\" href=\"/support\">Support</Link>");
  });
});
