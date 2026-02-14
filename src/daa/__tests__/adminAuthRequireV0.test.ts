import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { requireDaaAdminViewerAuth } from "../adminAuth";
import { setDaaAdminUserActiveV0 } from "../sqlite/daaAdminUserStatusStoreV0";

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

async function resetDbFile(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  await rm(`${dbPath}.tmp`, { force: true });
  delete (globalThis as any)[GLOBAL_KEY];
}

describe("daa/adminAuth require* v0", () => {
  it("denies disabled tokens", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-admin-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

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
      await resetDbFile(dbPath);
    }
  });
});
