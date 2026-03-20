import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/cron/auth", () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/broker", () => ({
  readBrokerSessionState: vi.fn(),
  startBrokerSession: vi.fn(),
  logoutBrokerSession: vi.fn(),
  syncBrokerOrders: vi.fn(),
}));

import { GET as getBrokerSession } from "@/app/api/daa/broker/session/route";
import { POST as startBrokerSessionRoute } from "@/app/api/daa/broker/session/start/route";
import { POST as logoutBrokerSessionRoute } from "@/app/api/daa/broker/session/logout/route";
import { POST as syncBrokerOrdersRoute } from "@/app/api/daa/broker/orders/sync/route";
import { POST as syncBrokerOrdersCronRoute } from "@/app/api/daa/cron/broker-orders-sync/route";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { logoutBrokerSession, readBrokerSessionState, startBrokerSession, syncBrokerOrders } from "@/src/daa/broker";

describe("broker-routes-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCronAuth).mockResolvedValue(null);
    vi.mocked(readBrokerSessionState).mockResolvedValue({
      brokerKind: "ibkr_paper",
      status: "authenticated",
      accountId: "DU123456",
      loginUrl: "https://localhost:5000",
      message: "ok",
      lastCheckedAt: "2026-03-19T10:00:00.000Z",
      lastAuthenticatedAt: "2026-03-19T09:59:00.000Z",
      lastError: null,
      sessionMeta: null,
      updatedAt: "2026-03-19T10:00:00.000Z",
    });
    vi.mocked(startBrokerSession).mockResolvedValue({
      brokerKind: "ibkr_paper",
      status: "pending_login",
      accountId: "DU123456",
      loginUrl: "https://localhost:5000",
      message: "pending",
      lastCheckedAt: "2026-03-19T10:00:00.000Z",
      lastAuthenticatedAt: null,
      lastError: null,
      sessionMeta: null,
      updatedAt: "2026-03-19T10:00:00.000Z",
    });
    vi.mocked(logoutBrokerSession).mockResolvedValue({
      brokerKind: "ibkr_paper",
      status: "disconnected",
      accountId: null,
      loginUrl: "https://localhost:5000",
      message: "disconnected",
      lastCheckedAt: "2026-03-19T10:00:00.000Z",
      lastAuthenticatedAt: null,
      lastError: null,
      sessionMeta: null,
      updatedAt: "2026-03-19T10:00:00.000Z",
    });
    vi.mocked(syncBrokerOrders).mockResolvedValue({
      kind: "ibkr_paper",
      scope: "open",
      orderCount: 2,
      updatedCount: 1,
      positionCount: 3,
      tickets: [],
    });
  });

  it("读取 broker 会话状态", async () => {
    const response = await getBrokerSession(new Request("http://localhost/api/daa/broker/session"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("authenticated");
    expect(vi.mocked(readBrokerSessionState)).toHaveBeenCalledWith({ refresh: true });
  });

  it("发起 broker 登录与退出连接", async () => {
    const startResponse = await startBrokerSessionRoute(new Request("http://localhost/api/daa/broker/session/start", { method: "POST" }));
    const startJson = await startResponse.json();
    expect(startResponse.status).toBe(200);
    expect(startJson.data.status).toBe("pending_login");

    const logoutResponse = await logoutBrokerSessionRoute(new Request("http://localhost/api/daa/broker/session/logout", { method: "POST" }));
    const logoutJson = await logoutResponse.json();
    expect(logoutResponse.status).toBe(200);
    expect(logoutJson.data.status).toBe("disconnected");
  });

  it("管理端同步 broker 订单", async () => {
    vi.mocked(syncBrokerOrders).mockResolvedValueOnce({
      kind: "ibkr_paper",
      scope: "recent",
      orderCount: 2,
      updatedCount: 1,
      positionCount: 3,
      tickets: [],
    });
    const response = await syncBrokerOrdersRoute(new Request("http://localhost/api/daa/broker/orders/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "recent", limit: 20 }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.scope).toBe("recent");
    expect(vi.mocked(syncBrokerOrders)).toHaveBeenCalledWith({
      scope: "recent",
      ticketId: null,
      limit: 20,
    });
  });

  it("cron 同步会校验 cron 鉴权", async () => {
    const denied = NextResponse.json({ ok: false }, { status: 401 });
    vi.mocked(requireCronAuth).mockResolvedValueOnce(denied);
    const deniedResponse = await syncBrokerOrdersCronRoute(new Request("http://localhost/api/daa/cron/broker-orders-sync", { method: "POST" }));
    expect(deniedResponse.status).toBe(401);

    vi.mocked(syncBrokerOrders).mockResolvedValueOnce({
      kind: "ibkr_paper",
      scope: "recent",
      orderCount: 2,
      updatedCount: 1,
      positionCount: 3,
      tickets: [],
    });
    const response = await syncBrokerOrdersCronRoute(new Request("http://localhost/api/daa/cron/broker-orders-sync?scope=recent", { method: "POST" }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.scope).toBe("recent");
    expect(vi.mocked(syncBrokerOrders)).toHaveBeenLastCalledWith({ scope: "recent" });
  });
});
