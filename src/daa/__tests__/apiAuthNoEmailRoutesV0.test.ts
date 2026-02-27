import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("auth email-login removal guard", () => {
  it("removes deprecated /api/daa/auth/email-login routes from runtime tree", () => {
    const emailLoginDir = path.resolve(process.cwd(), "app/api/daa/auth/email-login");
    expect(existsSync(emailLoginDir)).toBe(false);
  });
});
