import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  listDaaCandidateAssetsV1: vi.fn(async () => [
    {
      id: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      enabled: true,
      targetWeightHint: 0.08,
      tags: ["core"],
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]),
  replaceDaaCandidateAssetsV1: vi.fn(async (rows: unknown[]) => rows),
}));

import { GET, POST } from "@/app/api/daa/store/candidate-assets/route";

describe("candidate-assets-route-v1", () => {
  it("GET 返回候选资产列表", async () => {
    const response = await GET(new Request("http://localhost/api/daa/store/candidate-assets"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.candidates)).toBe(true);
    expect(json.data.candidates[0]?.symbol).toBe("AAPL");
  });

  it("POST 校验 candidates 必填数组", async () => {
    const response = await POST(new Request("http://localhost/api/daa/store/candidate-assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidates: null }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });
});
