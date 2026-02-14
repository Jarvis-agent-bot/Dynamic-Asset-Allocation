import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getDaaAdminUserStatusMapV0, getDaaAdminUserStatusV0, setDaaAdminUserActiveV0 } from "../daaAdminUserStatusStoreV0";

const GLOBAL_KEY = "__daa_sqlite_state_v0__";

async function resetDbFile(dbPath: string) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  await rm(dbPath, { force: true });
  await rm(`${dbPath}.tmp`, { force: true });
  delete (globalThis as any)[GLOBAL_KEY];
}

describe("daa/sqlite admin user status store v0", () => {
  it("defaults to active; persists inactive override; clears back to active", async () => {
    const dbPath = path.join(process.cwd(), ".vitest-tmp", `daa-admin-users-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    process.env.DAA_SQLITE_PATH = dbPath;
    await resetDbFile(dbPath);

    expect(await getDaaAdminUserStatusV0("viewer-token")).toBe("active");

    await setDaaAdminUserActiveV0({ userId: "viewer-token", active: false, updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(await getDaaAdminUserStatusV0("viewer-token")).toBe("inactive");

    // Prove persistence: drop in-memory cache and reload from disk.
    delete (globalThis as any)[GLOBAL_KEY];

    expect(await getDaaAdminUserStatusV0("viewer-token")).toBe("inactive");

    await setDaaAdminUserActiveV0({ userId: "viewer-token", active: true });
    expect(await getDaaAdminUserStatusV0("viewer-token")).toBe("active");

    const m = await getDaaAdminUserStatusMapV0(["viewer-token", "editor-token"]);
    expect(m["viewer-token"]).toBe("active");
    expect(m["editor-token"]).toBe("active");

    await resetDbFile(dbPath);
  });
});
