import { describe, expect, it, beforeEach, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
  replaceDaaFxRates: vi.fn(async (rows: unknown[]) => rows),
  replaceDaaCandidateAssets: vi.fn(async (rows: unknown[]) => rows),
  appendDaaEquitySnapshot: vi.fn(async (row: unknown) => row),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  listDaaFxRates: vi.fn(async () => []),
  replaceDaaFxRates: storeMocks.replaceDaaFxRates,
  listDaaCandidateAssets: vi.fn(async () => []),
  replaceDaaCandidateAssets: storeMocks.replaceDaaCandidateAssets,
  listDaaEquitySnapshots: vi.fn(async () => []),
  appendDaaEquitySnapshot: storeMocks.appendDaaEquitySnapshot,
}));

import { POST as postFxRates } from "@/app/api/daa/store/fx-rates/route";
import { POST as postCandidateAssets } from "@/app/api/daa/store/candidate-assets/route";
import { POST as postEquitySnapshot } from "@/app/api/daa/store/equity-snapshots/route";

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("store write route validation", () => {
  beforeEach(() => {
    storeMocks.replaceDaaFxRates.mockClear();
    storeMocks.replaceDaaCandidateAssets.mockClear();
    storeMocks.appendDaaEquitySnapshot.mockClear();
  });

  it("校验 FX rate payload 并传入类型化结构", async () => {
    const response = await postFxRates(jsonRequest("http://localhost/api/daa/store/fx-rates", {
      rates: [{ baseCcy: "USD", quoteCcy: "HKD", rate: 7.8, source: "manual" }],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(storeMocks.replaceDaaFxRates).toHaveBeenCalledWith([
      { baseCcy: "USD", quoteCcy: "HKD", rate: 7.8, source: "manual" },
    ]);
  });

  it("拒绝 FX rate 的旧式 snake_case 字段", async () => {
    const response = await postFxRates(jsonRequest("http://localhost/api/daa/store/fx-rates", {
      rates: [{ base_ccy: "USD", quote_ccy: "HKD", rate: 7.8 }],
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(storeMocks.replaceDaaFxRates).not.toHaveBeenCalled();
  });

  it("校验 candidate asset payload", async () => {
    const response = await postCandidateAssets(jsonRequest("http://localhost/api/daa/store/candidate-assets", {
      candidates: [{ symbol: "NVDA", market: "US", currency: "USD", enabled: true, targetWeightHint: 0.08, tags: ["ai"] }],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(storeMocks.replaceDaaCandidateAssets).toHaveBeenCalledWith([
      { symbol: "NVDA", market: "US", currency: "USD", enabled: true, targetWeightHint: 0.08, tags: ["ai"] },
    ]);
  });

  it("拒绝负目标权重", async () => {
    const response = await postCandidateAssets(jsonRequest("http://localhost/api/daa/store/candidate-assets", {
      candidates: [{ symbol: "NVDA", targetWeightHint: -0.01 }],
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(storeMocks.replaceDaaCandidateAssets).not.toHaveBeenCalled();
  });

  it("校验 equity snapshot payload", async () => {
    const response = await postEquitySnapshot(jsonRequest("http://localhost/api/daa/store/equity-snapshots", {
      snapshot: { totalEquity: 10000, holdingsValue: 7000, cash: 3000, source: "manual" },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(storeMocks.appendDaaEquitySnapshot).toHaveBeenCalledWith({
      totalEquity: 10000,
      holdingsValue: 7000,
      cash: 3000,
      source: "manual",
    });
  });

  it("拒绝不完整 equity snapshot", async () => {
    const response = await postEquitySnapshot(jsonRequest("http://localhost/api/daa/store/equity-snapshots", {
      snapshot: { totalEquity: 10000, cash: 3000 },
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(storeMocks.appendDaaEquitySnapshot).not.toHaveBeenCalled();
  });
});
