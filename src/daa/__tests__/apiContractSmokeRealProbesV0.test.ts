import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.fn(async () => null);

vi.mock("@/src/daa/fixtureSmokeGateV0", () => ({
  requireDaaFixtureSmokeGateV0: gate,
}));

describe("/api/daa/api-contract-smoke real probes v0", () => {
  beforeEach(() => {
    gate.mockClear();
    vi.restoreAllMocks();
  });

  it("runs engine/market/rebalance/store probes and returns pass metadata", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const mod = await import("../../../app/api/daa/api-contract-smoke/route");
    const res = await (mod as any).GET(new Request("https://example.com/api/daa/api-contract-smoke", { method: "GET" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary.total).toBe(4);
    expect(body.summary.pass).toBe(4);
    expect(body.summary.fail).toBe(0);
    expect(body.summary.failFast).toBe(false);
    expect(body.smoke).toBe("nextjs-api-contract-v7-real-probes");
    expect(body.checks).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails fast and emits errorCode/errorMessage when one probe fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "upstream_error", message: "market timeout" }), { status: 502 }),
      );

    const mod = await import("../../../app/api/daa/api-contract-smoke/route");
    const res = await (mod as any).GET(new Request("https://example.com/api/daa/api-contract-smoke", { method: "GET" }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.summary.total).toBe(4);
    expect(body.summary.pass).toBe(1);
    expect(body.summary.fail).toBe(1);
    expect(body.summary.failFast).toBe(true);
    expect(body.checks).toHaveLength(2);
    expect(body.checks[1].errorCode).toBe("upstream_error");
    expect(body.checks[1].errorMessage).toBe("market timeout");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
