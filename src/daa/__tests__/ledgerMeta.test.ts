import { beforeEach, describe, expect, it } from "vitest";

import { resetPgMemRuntime } from "@/src/daa/__tests__/pgMemTestUtils";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { getDaaCurrentLedgerMeta } from "@/src/daa/store/daaStorePg";

describe("ledger-meta-v1", () => {
  beforeEach(() => {
    resetPgMemRuntime();
  });

  it("按关联 cycle.created_at 统计已归档报告数量", async () => {
    await getDaaCurrentLedgerMeta();

    await withDaaPgClient(async ({ query }) => {
      await query(
        `INSERT INTO daa_portfolio_ledger_events (
           event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
           amount_in_account_base, fx_rate_to_account, settlement_ts, note, event_payload_json, created_at
         ) VALUES (
           'ledger-reset-1', $1, 'ledger_reset', 'deposit', 0, 'USD', 'USD', 0, 1, $1, 'reset', '{}'::jsonb, NOW()
         )`,
        ["2026-03-10T00:00:00.000Z"],
      );

      await query(
        `INSERT INTO daa_rebalance_cycles (
           cycle_id, status, trigger_source, trigger_reason, snapshot_at, equity_snapshot, created_at
         ) VALUES
           ('cycle-old', 'completed', 'manual', 'old', '2026-03-01T00:00:00.000Z', 0, '2026-03-01T00:00:00.000Z'),
           ('cycle-new', 'completed', 'manual', 'new', '2026-03-12T00:00:00.000Z', 0, '2026-03-12T00:00:00.000Z')`,
      );

      await query(
        `INSERT INTO daa_cycle_reports (
           cycle_id, before_snapshot_json, after_snapshot_json, execution_stats_json, pnl_attribution_json, risk_delta_json, created_at
         ) VALUES
           ('cycle-old', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '2026-03-11T00:00:00.000Z'),
           ('cycle-new', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '2026-03-12T00:00:00.000Z')`,
      );
    });

    const meta = await getDaaCurrentLedgerMeta();

    expect(meta.ledgerStartTs).toBe("2026-03-10T00:00:00.000Z");
    expect(meta.archivedCycleCount).toBe(1);
    expect(meta.archivedReportCount).toBe(1);
  });
});
