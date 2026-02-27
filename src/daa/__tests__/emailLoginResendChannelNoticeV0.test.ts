import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("email-login deactivation contracts", () => {
  it("keeps email-login modules in repo but deactivates runtime API + UI path", () => {
    const requestRoute = fs.readFileSync(path.join(process.cwd(), "app/api/daa/auth/email-login/request/route.ts"), "utf8");
    const verifyRoute = fs.readFileSync(path.join(process.cwd(), "app/api/daa/auth/email-login/verify/route.ts"), "utf8");
    const consumeRoute = fs.readFileSync(path.join(process.cwd(), "app/api/daa/auth/email-login/consume/route.ts"), "utf8");
    const loginSource = fs.readFileSync(path.join(process.cwd(), "app/daa/login/_components/DaaLoginClient.tsx"), "utf8");

    expect(requestRoute).toContain('error: "email_login_disabled"');
    expect(verifyRoute).toContain('error: "email_login_disabled"');
    expect(consumeRoute).toContain('error: "email_login_disabled"');

    expect(loginSource).toContain("Sign in with username + password");
    expect(loginSource).toContain("Email OTP login has been disabled");
    expect(loginSource).not.toContain("Sign in with email code");
  });
});
