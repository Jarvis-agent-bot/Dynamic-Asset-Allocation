import { describe, expect, it, vi } from "vitest";

import { ok, withApiHandler } from "@/src/daa/api/routeHelpers";

describe("daa-route-helpers-v1", () => {
  it("给成功响应追加 API 耗时 header", async () => {
    const response = await withApiHandler(async () => ok({ value: 1 }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-daa-route-time-ms")).toMatch(/^\d+\.\d$/);
    expect(response.headers.get("server-timing")).toContain("daa;dur=");
  });

  it("给异常响应也追加 API 耗时 header", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await withApiHandler(async () => {
      throw new Error("boom");
    });
    consoleError.mockRestore();

    expect(response.status).toBe(500);
    expect(response.headers.get("x-daa-route-time-ms")).toMatch(/^\d+\.\d$/);
  });
});
