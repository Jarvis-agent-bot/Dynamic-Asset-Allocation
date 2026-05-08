import { describe, expect, it } from "vitest";

import { getDaaAccountScopeId, withDaaAccountScope } from "@/src/daa/account/accountScope";
import { upsertTargetAllocationInTx, upsertWatchlistEntryInTx } from "@/src/daa/store/assetMasterStore";
import { replacePositionsV2SnapshotInTx, syncSinglePositionV2InTx } from "@/src/daa/store/positionStore";
import type { DaaTxQueryFn } from "@/src/daa/store/storeShared";

function createPositionQuerySpy() {
  const positions = new Map<string, { ownerAccountId: string; assetKey: string; qty: number }>();
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query: DaaTxQueryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1 AND asset_key = $2")) {
      positions.delete(`${String(params[0])}:${String(params[1])}`);
    } else if (sql.includes("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1")) {
      const ownerAccountId = String(params[0]);
      for (const key of [...positions.keys()]) {
        if (key.startsWith(`${ownerAccountId}:`)) positions.delete(key);
      }
    } else if (sql.includes("INSERT INTO daa_positions_v2")) {
      positions.set(`${String(params[0])}:${String(params[1])}`, {
        ownerAccountId: String(params[0]),
        assetKey: String(params[1]),
        qty: Number(params[5]),
      });
    }
    return { rows: [], rowCount: 0 };
  };
  return { query, calls, positions };
}

describe("daa-account-scope-v1", () => {
  it("AsyncLocalStorage 能在并发任务中隔离账号作用域", async () => {
    const [scopeA, scopeB] = await Promise.all([
      withDaaAccountScope("acct-a", async () => {
        await Promise.resolve();
        return getDaaAccountScopeId();
      }),
      withDaaAccountScope("acct-b", async () => {
        await Promise.resolve();
        return getDaaAccountScopeId();
      }),
    ]);

    expect(scopeA).toBe("acct-a");
    expect(scopeB).toBe("acct-b");
    expect(getDaaAccountScopeId()).toBe("default");
  });

  it("持仓快照写入和删除只影响当前账号", async () => {
    const db = createPositionQuerySpy();

    await withDaaAccountScope("acct-a", () => replacePositionsV2SnapshotInTx(db.query, [{
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      qty: 1,
      price: 100,
    }]));
    await withDaaAccountScope("acct-b", () => replacePositionsV2SnapshotInTx(db.query, [{
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      qty: 2,
      price: 100,
    }]));

    expect(db.positions.get("acct-a:US::AAPL")?.qty).toBe(1);
    expect(db.positions.get("acct-b:US::AAPL")?.qty).toBe(2);

    await withDaaAccountScope("acct-a", () => syncSinglePositionV2InTx(db.query, {
      symbol: "AAPL",
      market: "US",
      qty: 0,
    }));

    expect(db.positions.has("acct-a:US::AAPL")).toBe(false);
    expect(db.positions.get("acct-b:US::AAPL")?.qty).toBe(2);
  });

  it("观察池和目标权重写入会携带当前账号", async () => {
    const db = createPositionQuerySpy();

    await withDaaAccountScope("acct-b", async () => {
      await upsertWatchlistEntryInTx(db.query, {
        assetKey: "US::NVDA",
        watchEnabled: true,
        watchTags: ["ai"],
      });
      await upsertTargetAllocationInTx(db.query, "US::NVDA", 0.1);
    });

    const watchlistCall = db.calls.find((call) => call.sql.includes("INSERT INTO daa_watchlist_entries"));
    const targetCall = db.calls.find((call) => call.sql.includes("INSERT INTO daa_target_allocations"));
    expect(watchlistCall?.params[0]).toBe("acct-b");
    expect(targetCall?.params[0]).toBe("acct-b");
  });
});
