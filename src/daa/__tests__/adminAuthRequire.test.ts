import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDaaAuthContextFromRequest: vi.fn(),
}));

vi.mock("@/src/daa/auth/daaAuthRequest", () => ({
  getDaaAuthContextFromRequest: mocks.getDaaAuthContextFromRequest,
}));

import { requireDaaAdminViewerAuth } from "../adminAuth";

function mockLocalAuthContext(account: { id: string; email: string; roles: string[] } | null) {
  mocks.getDaaAuthContextFromRequest.mockResolvedValue(account ? {
    token: "session-token-1",
    account: {
      accountId: account.id,
      username: account.email,
      roles: account.roles,
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    session: {
      sessionId: "session-1",
      accountId: account.id,
      createdAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-02-01T00:00:00Z",
      revokedAt: null,
      lastSeenAt: null,
      userAgent: null,
      ip: null,
    },
  } : null);
}

describe("daa/adminAuth require* v0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies request without valid local session", async () => {
    mockLocalAuthContext(null);

    const req = new Request("http://localhost/api/daa/admin/users");
    const denied = await requireDaaAdminViewerAuth(req);

    expect(denied).not.toBe(null);
    expect(denied!.status).toBe(401);
  });

  it("allows viewer role via local session", async () => {
    mockLocalAuthContext({
      id: "user-1",
      email: "viewer@example.com",
      roles: ["viewer"],
    });

    const req = new Request("http://localhost/api/daa/admin/users");
    expect(await requireDaaAdminViewerAuth(req)).toBe(null);
  });

  it("denies viewer-only user from editor endpoints", async () => {
    mockLocalAuthContext({
      id: "user-1",
      email: "viewer@example.com",
      roles: ["viewer"],
    });

    const { requireDaaAdminEditorAuth } = await import("../adminAuth");
    const req = new Request("http://localhost/api/daa/admin/users");
    const denied = await requireDaaAdminEditorAuth(req);

    expect(denied).not.toBe(null);
    expect(denied!.status).toBe(401);
  });

  it("allows editor role for editor endpoints", async () => {
    mockLocalAuthContext({
      id: "user-1",
      email: "editor@example.com",
      roles: ["editor"],
    });

    const { requireDaaAdminEditorAuth } = await import("../adminAuth");
    const req = new Request("http://localhost/api/daa/admin/users");
    expect(await requireDaaAdminEditorAuth(req)).toBe(null);
  });
});
