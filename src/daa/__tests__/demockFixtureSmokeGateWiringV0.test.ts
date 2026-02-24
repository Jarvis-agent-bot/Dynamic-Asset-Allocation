import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ops-daa-demock-pr1-fixture-smoke-gate-wiring-v0", () => {
  it("wires fixture/smoke routes through a unified gate helper", () => {
    const fixtureRoute = readFileSync(resolve(process.cwd(), "app/api/daa/fixtures/step2-market-events-v0/route.ts"), "utf8");
    const pmSmokeRoute = readFileSync(resolve(process.cwd(), "app/api/daa/pm-bridge-smoke/route.ts"), "utf8");
    const contractSmokeRoute = readFileSync(resolve(process.cwd(), "app/api/daa/api-contract-smoke/route.ts"), "utf8");

    expect(fixtureRoute).toContain('requireDaaFixtureSmokeGateV0(req, "fixture")');
    expect(pmSmokeRoute).toContain('requireDaaFixtureSmokeGateV0(req, "smoke")');
    expect(contractSmokeRoute).toContain('requireDaaFixtureSmokeGateV0(req, "smoke")');
  });
});
