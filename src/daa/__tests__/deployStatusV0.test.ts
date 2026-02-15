import { describe, expect, it } from "vitest";

import { buildDeployStatusPayloadV0 } from "../deployStatusV0";

describe("daa/deployStatusV0", () => {
  it("reports missing required/bootstrap vars as missing", () => {
    const payload = buildDeployStatusPayloadV0({ NODE_ENV: "production" }, "2026-02-16T00:00:00.000Z");

    expect(payload.ok).toBe(true);
    expect(payload.bootstrap.missingRequired).toContain("DAA_SQLITE_PATH");
    expect(payload.bootstrap.missingBootstrap).toContain("DAA_AUTH_BOOTSTRAP_TOKEN");
  });

  it("marks required/bootstrap vars ok when set", () => {
    const payload = buildDeployStatusPayloadV0(
      {
        NODE_ENV: "production",
        DAA_SQLITE_PATH: "/var/lib/daa/daa.sqlite",
        DAA_AUTH_BOOTSTRAP_TOKEN: "secret",
        DAA_ENV: "prod",
        NEXT_PUBLIC_BUILD_SHA: "abc123",
      },
      "2026-02-16T00:00:00.000Z"
    );

    expect(payload.bootstrap.missingRequired).toEqual([]);
    expect(payload.bootstrap.missingBootstrap).toEqual([]);
    expect(payload.bootstrap.missingRecommended).toEqual([]);
  });

  it("treats any of the SHA candidates as satisfying build SHA", () => {
    const payload = buildDeployStatusPayloadV0({ BUILD_SHA: "deadbeef" }, "2026-02-16T00:00:00.000Z");
    expect(payload.build.sha).toBe("deadbeef");

    // BUILD_SHA is one of the recommended candidates.
    expect(payload.bootstrap.missingRecommended).not.toContain("BUILD_SHA");
  });
});
