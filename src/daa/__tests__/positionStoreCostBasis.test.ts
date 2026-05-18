import { describe, expect, it } from "vitest";

import { withDaaAccountScope } from "@/src/daa/account/accountScope";
import { replacePositionsV2SnapshotInTx, syncSinglePositionV2InTx } from "@/src/daa/store/positionStore";
import type { DaaTxQueryFn } from "@/src/daa/store/storeShared";

type StoredPosition = {
  ownerAccountId: string;
  assetKey: string;
  currency: string;
  qty: number;
  costBasis: number | null;
  costBasisInBase: number | null;
};

function createCostBasisDb() {
  const positions = new Map<string, StoredPosition>();
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const accountBaseCurrencies = new Map<string, string>([["acct-a", "USD"]]);
  const fxRates = [
    { base_ccy: "USD", quote_ccy: "HKD", rate: 7.8 },
    { base_ccy: "USD", quote_ccy: "JPY", rate: 150 },
  ];
  const positionKey = (ownerAccountId: unknown, assetKey: unknown) => `${String(ownerAccountId)}:${String(assetKey)}`;

  const query: DaaTxQueryFn = async <Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT cost_basis_in_base FROM daa_positions_v2")) {
      const existing = positions.get(positionKey(params[0], params[1]));
      const rows = existing ? [{ cost_basis_in_base: existing.costBasisInBase }] : [];
      return { rows: rows as unknown as Row[], rowCount: rows.length };
    }
    if (sql.includes("SELECT base_currency FROM daa_account_state_v2")) {
      const rows = [{ base_currency: accountBaseCurrencies.get(String(params[0])) ?? "USD" }];
      return { rows: rows as unknown as Row[], rowCount: rows.length };
    }
    if (sql.includes("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates")) {
      return { rows: fxRates as unknown as Row[], rowCount: fxRates.length };
    }
    if (sql.includes("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1 AND asset_key = $2")) {
      positions.delete(positionKey(params[0], params[1]));
    } else if (sql.includes("DELETE FROM daa_positions_v2 WHERE owner_account_id = $1")) {
      const ownerAccountId = String(params[0]);
      for (const key of [...positions.keys()]) {
        if (key.startsWith(`${ownerAccountId}:`)) positions.delete(key);
      }
    } else if (sql.includes("INSERT INTO daa_positions_v2")) {
      positions.set(positionKey(params[0], params[1]), {
        ownerAccountId: String(params[0]),
        assetKey: String(params[1]),
        currency: String(params[4]),
        qty: Number(params[5]),
        costBasis: params[7] == null ? null : Number(params[7]),
        costBasisInBase: params[8] == null ? null : Number(params[8]),
      });
    }
    return { rows: [] as Row[], rowCount: 0 };
  };

  return { calls, positions, query };
}

describe("positionStore cost_basis_in_base", () => {
  it("单条持仓未修改成本或币种时保留已有基准成本", async () => {
    const db = createCostBasisDb();
    db.positions.set("acct-a:HK::0700", {
      ownerAccountId: "acct-a",
      assetKey: "HK::0700",
      currency: "HKD",
      qty: 10,
      costBasis: 7800,
      costBasisInBase: 1234,
    });

    await withDaaAccountScope("acct-a", () => syncSinglePositionV2InTx(db.query, {
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      qty: 10,
      price: 400,
      costBasis: 7800,
    }, {
      costBasisInBaseMode: "preserve",
    }));

    expect(db.positions.get("acct-a:HK::0700")?.costBasisInBase).toBe(1234);
    expect(db.calls.some((call) => call.sql.includes("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates"))).toBe(false);
  });

  it("单条持仓修改成本或币种时用账户基准币和 FX 重算", async () => {
    const db = createCostBasisDb();
    db.positions.set("acct-a:HK::0700", {
      ownerAccountId: "acct-a",
      assetKey: "HK::0700",
      currency: "HKD",
      qty: 10,
      costBasis: 7000,
      costBasisInBase: 900,
    });

    await withDaaAccountScope("acct-a", () => syncSinglePositionV2InTx(db.query, {
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      qty: 10,
      price: 400,
      costBasis: 7800,
    }, {
      costBasisInBaseMode: "recompute",
    }));

    expect(db.positions.get("acct-a:HK::0700")?.costBasisInBase).toBeCloseTo(1000);
    expect(db.calls.some((call) => call.sql.includes("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates"))).toBe(true);
  });

  it("调用方显式传入基准成本时优先使用显式值", async () => {
    const db = createCostBasisDb();

    await withDaaAccountScope("acct-a", () => syncSinglePositionV2InTx(db.query, {
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      qty: 10,
      price: 400,
      costBasis: 7800,
      costBasisInBase: 888,
    }, {
      costBasisInBaseMode: "recompute",
    }));

    expect(db.positions.get("acct-a:HK::0700")?.costBasisInBase).toBe(888);
    expect(db.calls.some((call) => call.sql.includes("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates"))).toBe(false);
  });

  it("全量快照没有显式基准成本时会补齐 FX 折算值", async () => {
    const db = createCostBasisDb();

    await withDaaAccountScope("acct-a", () => replacePositionsV2SnapshotInTx(db.query, [{
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      qty: 10,
      price: 400,
      costBasis: 7800,
    }]));

    expect(db.positions.get("acct-a:HK::0700")?.costBasisInBase).toBeCloseTo(1000);
  });
});
