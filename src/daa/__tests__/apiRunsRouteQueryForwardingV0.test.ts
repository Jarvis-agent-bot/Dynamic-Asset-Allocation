import { beforeEach, describe, expect, it, vi } from "vitest";

const listDaaRunsV0 = vi.fn();

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
  getDaaAdminActorUserIdFromRequestV1: vi.fn(async () => "admin:test"),
}));

vi.mock("@/src/daa/storeV0", () => ({
  listDaaRunsV0,
  createDaaRunV0: vi.fn(),
}));

describe("/api/daa/runs query forwarding v0", () => {
  beforeEach(() => {
    listDaaRunsV0.mockReset();
    listDaaRunsV0.mockResolvedValue([]);
  });

  it("forwards q and sort params so history filters are functional", async () => {
    const mod = await import("../../../app/api/daa/runs/route");

    const req = new Request("https://example.com/api/daa/runs?limit=25&q=%20dashboard%20&sort=CREATED_ASC", {
      method: "GET",
    });
    const res = await (mod as any).GET(req);

    expect(res.status).toBe(200);
    expect(listDaaRunsV0).toHaveBeenCalledTimes(1);
    expect(listDaaRunsV0).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
        q: "dashboard",
        sort: "created_asc",
      }),
    );
  });

  it("drops invalid sort and blank q instead of forwarding bad filters", async () => {
    const mod = await import("../../../app/api/daa/runs/route");

    const req = new Request("https://example.com/api/daa/runs?limit=10&q=%20%20%20&sort=sideways", {
      method: "GET",
    });
    const res = await (mod as any).GET(req);

    expect(res.status).toBe(200);
    expect(listDaaRunsV0).toHaveBeenCalledTimes(1);
    expect(listDaaRunsV0).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        q: undefined,
        sort: undefined,
      }),
    );
  });
});
