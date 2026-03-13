import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  listDaaTradeTickets: vi.fn(),
}));

import { GET } from "@/app/api/daa/workbench/execution/logs/route";
import { listDaaTradeTickets } from "@/src/daa/store/daaStorePg";

describe("workbench-execution-logs-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDaaTradeTickets).mockResolvedValue([
      { ticketId: "t1", status: "ready" },
      { ticketId: "t2", status: "executed" },
      { ticketId: "t3", status: "rejected" },
    ] as any);
  });

  it("默认仅返回非 ready 执行日志", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/execution/logs"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.logs.map((row: any) => row.ticketId)).toEqual(["t2", "t3"]);
  });

  it("指定 status 时按条件返回", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/execution/logs?status=ready"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(vi.mocked(listDaaTradeTickets)).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" }));
  });
});
