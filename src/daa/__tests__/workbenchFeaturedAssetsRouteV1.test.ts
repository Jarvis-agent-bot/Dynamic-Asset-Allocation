import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/market/yfinanceFetchV1", () => ({
  fetchYfinanceLatestCloseV1: vi.fn(),
}));

import { GET } from "@/app/api/daa/workbench/featured-assets/route";
import { fetchYfinanceLatestCloseV1 } from "@/src/market/yfinanceFetchV1";

describe("workbench-featured-assets-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchYfinanceLatestCloseV1).mockImplementation(async (symbolRaw: string) => ({
      symbol: String(symbolRaw || "").trim().toUpperCase(),
      price: 123.45,
      ts: "2026-03-04T00:00:00.000Z",
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("默认参数返回股票分组", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.groups)).toBe(true);
    expect(json.data.groups.map((group: { market: string }) => group.market)).toEqual(["US", "HK", "CN"]);
    expect(json.data.groups[0]?.items[0]).toMatchObject({
      market: "US",
      assetClass: "EQUITY",
    });
  });

  it("market=US 仅返回美股分组", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?market=US"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBe(1);
    expect(json.data.groups[0]?.market).toBe("US");
  });

  it("assetClass=CRYPTO 返回加密分组", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?assetClass=CRYPTO"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBe(1);
    expect(json.data.groups[0]?.market).toBe("CRYPTO");
    expect(json.data.groups[0]?.items.every((item: { assetClass: string }) => item.assetClass === "CRYPTO")).toBe(true);
  });

  it("limitPerMarket 生效", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?limitPerMarket=2"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups.length).toBeGreaterThan(0);
    expect(json.data.groups.every((group: { items: unknown[] }) => group.items.length <= 2)).toBe(true);
  });

  it("行情失败时仍返回推荐项且价格置 0", async () => {
    vi.mocked(fetchYfinanceLatestCloseV1).mockImplementation(async () => null);

    const response = await GET(new Request("http://localhost/api/daa/workbench/featured-assets?market=US&limitPerMarket=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.groups[0]?.items.length).toBe(1);
    expect(json.data.groups[0]?.items[0]?.price).toBe(0);
  });
});
