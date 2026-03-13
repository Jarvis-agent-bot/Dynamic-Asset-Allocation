import { describe, expect, it } from "vitest";

import {
  authenticateDaaAuthAccount,
  createDaaAuthAccount,
  getDaaAuthAccountByUsername,
} from "../daaAuthStore";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";

function resetPgMem() {
  process.env.DAA_PG_MEM = "1";
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

describe("daa/auth admin accounts CRUD v0", () => {
  it("lists accounts + supports updating roles/status + deleting", async () => {
    resetPgMem();

    const a1 = await createDaaAuthAccount({ username: "a1@example.com", password: "pw-1", roles: ["editor"] });
    const a2 = await createDaaAuthAccount({ username: "a2@example.com", password: "pw-2", roles: ["viewer"] });

    const mod = await import("../daaAuthStore");

    const listFn = (mod as any).listDaaAuthAccounts as undefined | (() => Promise<any[]>);
    expect(typeof listFn).toBe("function");
    if (typeof listFn !== "function") return;

    const xs1 = await listFn();
    const usernames1 = xs1.map((x) => x.username).sort();
    expect(usernames1).toEqual(["a1@example.com", "a2@example.com"]);

    const updateFn = (mod as any).updateDaaAuthAccount as
      | undefined
      | ((args: { accountId: string; roles?: string[]; status?: string }) => Promise<any>);
    expect(typeof updateFn).toBe("function");
    if (typeof updateFn !== "function") return;

    // Deactivate a2 and strip roles for a1.
    await updateFn({ accountId: a2.accountId, status: "inactive" });
    await updateFn({ accountId: a1.accountId, roles: ["viewer"] });

    const a2Auth = await authenticateDaaAuthAccount({ username: "a2@example.com", password: "pw-2" });
    expect(a2Auth).toBe(null);

    const a1After = await getDaaAuthAccountByUsername("a1@example.com");
    expect(a1After?.roles).toEqual(["viewer"]);

    const delFn = (mod as any).deleteDaaAuthAccount as undefined | ((args: { accountId: string }) => Promise<any>);
    expect(typeof delFn).toBe("function");
    if (typeof delFn !== "function") return;

    await delFn({ accountId: a2.accountId });

    const a2After = await getDaaAuthAccountByUsername("a2@example.com");
    expect(a2After).toBe(null);

    const xs2 = await listFn();
    expect(xs2.map((x) => x.username)).toEqual(["a1@example.com"]);
  });
});
