import { describe, expect, it } from "vitest";

import { resetTestDb, isTestDbAvailable } from "@/src/daa/__tests__/testDbSetup";
import {
  authenticateDaaAuthAccount,
  createDaaAuthAccount,
  deleteDaaAuthAccount,
  getDaaAuthAccountByUsername,
  listDaaAuthAccounts,
  resetDaaAuthAccountPassword,
  updateDaaAuthAccount,
} from "../daaAuthStore";

describe.skipIf(!isTestDbAvailable())("daa/auth admin accounts CRUD v0", () => {
  it("lists accounts + supports updating roles/status + deleting", async () => {
    await resetTestDb();

    const a1 = await createDaaAuthAccount({ username: "a1@example.com", password: "pw-1", roles: ["editor"] });
    const a2 = await createDaaAuthAccount({ username: "a2@example.com", password: "pw-2", roles: ["viewer"] });

    const xs1 = await listDaaAuthAccounts();
    const usernames1 = xs1.map((x) => x.username).sort();
    expect(usernames1).toEqual(["a1@example.com", "a2@example.com"]);

    // Deactivate a2 and strip roles for a1.
    await updateDaaAuthAccount({ accountId: a2.accountId, status: "inactive" });
    await updateDaaAuthAccount({ accountId: a1.accountId, roles: ["viewer"] });

    const a2Auth = await authenticateDaaAuthAccount({ username: "a2@example.com", password: "pw-2" });
    expect(a2Auth).toBe(null);

    const a1After = await getDaaAuthAccountByUsername("a1@example.com");
    expect(a1After?.roles).toEqual(["viewer"]);

    await deleteDaaAuthAccount({ accountId: a2.accountId });

    const a2After = await getDaaAuthAccountByUsername("a2@example.com");
    expect(a2After).toBe(null);

    const xs2 = await listDaaAuthAccounts();
    expect(xs2.map((x) => x.username)).toEqual(["a1@example.com"]);
  });

  it("supports resetting an account password without exposing the hash", async () => {
    await resetTestDb();

    const a1 = await createDaaAuthAccount({ username: "reset@example.com", password: "pw-old", roles: ["viewer"] });
    expect(await authenticateDaaAuthAccount({ username: "reset@example.com", password: "pw-old" })).not.toBe(null);

    const reset = await resetDaaAuthAccountPassword({ accountId: a1.accountId, password: "pw-new" });
    expect(reset.ok).toBe(true);
    if (reset.ok) {
      expect("passwordHash" in reset.account).toBe(false);
    }

    expect(await authenticateDaaAuthAccount({ username: "reset@example.com", password: "pw-old" })).toBe(null);
    expect(await authenticateDaaAuthAccount({ username: "reset@example.com", password: "pw-new" })).not.toBe(null);
  });
});
