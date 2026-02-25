import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("backend-daa-audit-executor-protocol-route-wiring-v0", () => {
  it("wires unified protocol fields into runs route response", () => {
    const file = resolve(process.cwd(), "app/api/daa/store/v0/runs/route.ts");
    const source = readFileSync(file, "utf8");

    expect(source).toContain('import { buildDaaAuditExecutorProtocolV0 } from "../../../../../../src/daa/auditExecutorProtocolV0";');
    expect(source).toContain("const runsWithProtocol = runs.map((run) => ({");
    expect(source).toContain("protocol: buildDaaAuditExecutorProtocolV0({");
    expect(source).toContain("return NextResponse.json({ ok: true, runs: runsWithProtocol });");
  });
});
