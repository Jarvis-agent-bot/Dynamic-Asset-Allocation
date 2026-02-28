import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("hotfix-auth-login-stability-v0", () => {
  it("adds explicit session refresh control with no-store auth/me fetches", () => {
    const file = resolve(process.cwd(), "app/daa/login/_components/DaaLoginClient.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("刷新会话");
    expect(source).toContain("cache: \"no-store\"");
    expect(source).toContain("toast.success(\"会话已刷新。\")");
  });
});
