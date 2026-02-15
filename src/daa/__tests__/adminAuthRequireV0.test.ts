import { describe, expect, it } from "vitest";

import { requireDaaAdminViewerAuth } from "../adminAuth";
import { setDaaAdminUserActiveV0 } from "../adminUserStatusStoreV0";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_PG_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMem() {
  // Use in-memory Postgres emulation for unit tests.
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

describe("daa/adminAuth require* v0", () => {
  it("denies disabled tokens", async () => {
    resetPgMem();

    const prev = {
      legacy: process.env.DAA_ADMIN_TOKEN,
      viewer: process.env.DAA_ADMIN_VIEWER_TOKEN,
      editor: process.env.DAA_ADMIN_EDITOR_TOKEN,
    };

    try {
      process.env.DAA_ADMIN_TOKEN = "";
      process.env.DAA_ADMIN_VIEWER_TOKEN = "viewer-1";
      process.env.DAA_ADMIN_EDITOR_TOKEN = "";

      const okReq = new Request("http://localhost/api/daa/admin/users", { headers: { authorization: "Bearer viewer-1" } });
      expect(await requireDaaAdminViewerAuth(okReq)).toBe(null);

      await setDaaAdminUserActiveV0({ userId: "viewer-token", active: false, updatedAt: "2026-01-01T00:00:00.000Z" });

      const denied = await requireDaaAdminViewerAuth(okReq);
      expect(denied).not.toBe(null);
      expect(denied!.status).toBe(401);
    } finally {
      process.env.DAA_ADMIN_TOKEN = prev.legacy;
      process.env.DAA_ADMIN_VIEWER_TOKEN = prev.viewer;
      process.env.DAA_ADMIN_EDITOR_TOKEN = prev.editor;
    }
  });
});
