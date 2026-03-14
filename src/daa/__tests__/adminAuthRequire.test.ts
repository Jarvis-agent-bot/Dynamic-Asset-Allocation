import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseFromRequest: vi.fn(),
}));

vi.mock("@/src/daa/supabase/server", () => ({
  createSupabaseFromRequest: mocks.createSupabaseFromRequest,
  createSupabaseServerClient: vi.fn(),
}));

import { requireDaaAdminViewerAuth } from "../adminAuth";

function mockSupabaseUser(user: any) {
  mocks.createSupabaseFromRequest.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : { message: "not authenticated" },
      })),
    },
  });
}

describe("daa/adminAuth require* v0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies request without valid Supabase session", async () => {
    mockSupabaseUser(null);

    const req = new Request("http://localhost/api/daa/admin/users");
    const denied = await requireDaaAdminViewerAuth(req);

    expect(denied).not.toBe(null);
    expect(denied!.status).toBe(401);
  });

  it("allows viewer role via Supabase session", async () => {
    mockSupabaseUser({
      id: "user-1",
      email: "viewer@example.com",
      app_metadata: { roles: ["viewer"] },
      created_at: "2026-01-01T00:00:00Z",
    });

    const req = new Request("http://localhost/api/daa/admin/users");
    expect(await requireDaaAdminViewerAuth(req)).toBe(null);
  });

  it("denies viewer-only user from editor endpoints", async () => {
    mockSupabaseUser({
      id: "user-1",
      email: "viewer@example.com",
      app_metadata: { roles: ["viewer"] },
      created_at: "2026-01-01T00:00:00Z",
    });

    const { requireDaaAdminEditorAuth } = await import("../adminAuth");
    const req = new Request("http://localhost/api/daa/admin/users");
    const denied = await requireDaaAdminEditorAuth(req);

    expect(denied).not.toBe(null);
    expect(denied!.status).toBe(401);
  });

  it("allows editor role for editor endpoints", async () => {
    mockSupabaseUser({
      id: "user-1",
      email: "editor@example.com",
      app_metadata: { roles: ["editor"] },
      created_at: "2026-01-01T00:00:00Z",
    });

    const { requireDaaAdminEditorAuth } = await import("../adminAuth");
    const req = new Request("http://localhost/api/daa/admin/users");
    expect(await requireDaaAdminEditorAuth(req)).toBe(null);
  });
});
