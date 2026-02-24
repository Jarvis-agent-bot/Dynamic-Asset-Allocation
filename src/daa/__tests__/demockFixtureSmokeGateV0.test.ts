import { beforeEach, describe, expect, it, vi } from "vitest";

let allowAdmin = false;

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => (allowAdmin ? null : new Response("unauthorized", { status: 401 }))),
}));

import { requireDaaFixtureSmokeGateV0 } from "../fixtureSmokeGateV0";

describe("ops-daa-demock-pr1-fixture-smoke-gate-v0", () => {
  beforeEach(() => {
    allowAdmin = false;
    delete process.env.DAA_ENABLE_FIXTURE_SMOKE_ROUTES;
  });

  it("blocks fixture route in production by default with 404", async () => {
    process.env.NODE_ENV = "production";

    const denied = await requireDaaFixtureSmokeGateV0(new Request("https://example.com/api/daa/fixtures/step2-market-events-v0"), "fixture");

    expect(denied?.status).toBe(404);
  });

  it("blocks smoke route in production by default with 403", async () => {
    process.env.NODE_ENV = "production";

    const denied = await requireDaaFixtureSmokeGateV0(new Request("https://example.com/api/daa/api-contract-smoke"), "smoke");

    expect(denied?.status).toBe(403);
  });

  it("allows dev access without admin auth", async () => {
    process.env.NODE_ENV = "development";

    const denied = await requireDaaFixtureSmokeGateV0(new Request("https://example.com/api/daa/api-contract-smoke"), "smoke");

    expect(denied).toBeNull();
  });

  it("allows production access when admin auth passes", async () => {
    process.env.NODE_ENV = "production";
    allowAdmin = true;

    const denied = await requireDaaFixtureSmokeGateV0(new Request("https://example.com/api/daa/api-contract-smoke"), "smoke");

    expect(denied).toBeNull();
  });
});
