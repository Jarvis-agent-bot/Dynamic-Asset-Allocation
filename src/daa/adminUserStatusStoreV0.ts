import { isDaaPgEnabledV0 } from "./pg/daaPgV0";

import * as sqlite from "./sqlite/daaAdminUserStatusStoreV0";
import * as pg from "./pg/daaAdminUserStatusStoreV0";

export type { DaaAdminUserIdV0, DaaAdminUserStatusV0 } from "./sqlite/daaAdminUserStatusStoreV0";

function usePg(): boolean {
  // Postgres is preferred when configured; sqlite remains as a local/dev fallback.
  return isDaaPgEnabledV0();
}

export async function getDaaAdminUserStatusV0(userId: Parameters<typeof sqlite.getDaaAdminUserStatusV0>[0]) {
  return usePg() ? pg.getDaaAdminUserStatusV0(userId) : sqlite.getDaaAdminUserStatusV0(userId);
}

export async function getDaaAdminUserStatusMapV0(userIds: Parameters<typeof sqlite.getDaaAdminUserStatusMapV0>[0]) {
  return usePg() ? pg.getDaaAdminUserStatusMapV0(userIds) : sqlite.getDaaAdminUserStatusMapV0(userIds);
}

export async function setDaaAdminUserActiveV0(args: Parameters<typeof sqlite.setDaaAdminUserActiveV0>[0]) {
  return usePg() ? pg.setDaaAdminUserActiveV0(args) : sqlite.setDaaAdminUserActiveV0(args);
}
