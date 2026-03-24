/**
 * Cash-ledger store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import { withDaaPgClient, toIsoString, type DaaTxQueryFn } from "./storeShared";
import type {
  DaaStoreCashLedgerEntry, DaaStoreCashLedgerSide, DaaStoreCashLedgerEntryKind,
  DaaStoreCashLedgerApplyInput, DaaCurrentLedgerMeta, DaaStoreEquitySnapshot,
} from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { buildFxLookupMap, resolveFxRateToBase, normalizeCcyCode } from "./fxStore";
import { buildPortfolioSnapshotFromAssetUniverseInTx } from "./portfolioStore";
import { syncStrategyAccountCashInTx, getAccountStateForUpdateInTx } from "./accountStore";

function mapCashLedgerRow(row: Record<string, unknown>): DaaStoreCashLedgerEntry {
  const normalizedSide = normalizeText(row.side, "deposit").toLowerCase();
  const side: DaaStoreCashLedgerSide = normalizedSide === "withdraw" ? "withdraw" : "deposit";
  const normalizedEntryKind = normalizeText(row.event_kind).toLowerCase();
  const entryKind: DaaStoreCashLedgerEntryKind | null = normalizedEntryKind === "trade_execution"
    ? "trade_execution"
    : normalizedEntryKind === "dividend"
      ? "dividend"
      : normalizedEntryKind === "opening_balance"
        ? "opening_balance"
      : ((normalizedEntryKind === "cash_transfer" || normalizedEntryKind === "manual") ? "manual" : null);
  return {
    id: normalizeText(row.event_id),
    ts: toIsoString(row.ts),
    side,
    amount: Math.max(0, toFiniteNumber(row.amount)),
    baseCurrency: normalizeCcyCode(row.base_currency, "USD"),
    entryKind,
    accountBaseCurrency: row.account_base_currency == null ? null : normalizeCcyCode(row.account_base_currency, "USD"),
    amountInAccountBase: row.amount_in_account_base == null ? null : Math.max(0, toFiniteNumber(row.amount_in_account_base)),
    fxRateToAccount: row.fx_rate_to_account == null ? null : Math.max(0, toFiniteNumber(row.fx_rate_to_account)),
    ticketId: row.ticket_id == null ? null : normalizeText(row.ticket_id) || null,
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    settlementTs: row.settlement_ts == null ? null : toIsoString(row.settlement_ts),
    note: row.note == null ? null : String(row.note),
    createdAt: toIsoString(row.created_at),
  };
}

async function getCurrentLedgerStartTsInTx(query: DaaTxQueryFn): Promise<string | null> {
  const result = await query(
    `SELECT ts
     FROM daa_portfolio_ledger_events
     WHERE event_kind = 'ledger_reset'
     ORDER BY ts DESC
     LIMIT 1`,
  );
  if (!result.rows.length) return null;
  return toIsoString(result.rows[0].ts);
}

export async function listDaaCashLedgerEntries(limit = 100): Promise<DaaStoreCashLedgerEntry[]> {
  await ensureDaaStoreSchemaPg();
  const n = Math.max(1, Math.min(1000, Math.trunc(toFiniteNumber(limit, 100))));
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
              amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, created_at
       FROM daa_portfolio_ledger_events
       WHERE event_kind <> 'ledger_reset'
       ORDER BY ts DESC
       LIMIT $1`,
      [n],
    );
    return result.rows.map((row) => mapCashLedgerRow(row as Record<string, unknown>));
  });
}

export async function getDaaLedgerStartTs(): Promise<string | null> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => getCurrentLedgerStartTsInTx(query as DaaTxQueryFn));
}

export async function getDaaCurrentLedgerMeta(): Promise<DaaCurrentLedgerMeta> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const ledgerStartTs = await getCurrentLedgerStartTsInTx(query as DaaTxQueryFn);
    if (!ledgerStartTs) {
      return {
        ledgerStartTs: null,
        openingBalance: 0,
        archivedCycleCount: 0,
        archivedTradeCount: 0,
        archivedReportCount: 0,
      };
    }

    const [openingRes, cycleRes, tradeRes, reportRes] = await Promise.all([
      query(
        `SELECT amount_in_account_base, amount
         FROM daa_portfolio_ledger_events
         WHERE event_kind = 'opening_balance'
           AND ts >= $1
         ORDER BY ts ASC
         LIMIT 1`,
        [ledgerStartTs],
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM daa_rebalance_cycles
         WHERE created_at < $1`,
        [ledgerStartTs],
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM daa_trade_tickets
         WHERE created_at < $1`,
        [ledgerStartTs],
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM daa_cycle_reports r
         JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
         WHERE c.created_at < $1`,
        [ledgerStartTs],
      ),
    ]);

    const openingRow = openingRes.rows[0] as Record<string, unknown> | undefined;
    return {
      ledgerStartTs,
      openingBalance: Math.max(
        0,
        toFiniteNumber(
          openingRow?.amount_in_account_base ?? openingRow?.amount,
          0,
        ),
      ),
      archivedCycleCount: Math.max(0, Math.trunc(toFiniteNumber(cycleRes.rows[0]?.count, 0))),
      archivedTradeCount: Math.max(0, Math.trunc(toFiniteNumber(tradeRes.rows[0]?.count, 0))),
      archivedReportCount: Math.max(0, Math.trunc(toFiniteNumber(reportRes.rows[0]?.count, 0))),
    };
  });
}

export async function appendDaaCashLedgerEntry(input: DaaStoreCashLedgerApplyInput): Promise<{
  entry: DaaStoreCashLedgerEntry;
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: DaaStoreEquitySnapshot;
}> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const sideRaw = normalizeText(input.side, "deposit").toLowerCase();
    const side: DaaStoreCashLedgerSide = sideRaw === "withdraw" ? "withdraw" : "deposit";
    const amount = Math.max(0, toFiniteNumber(input.amount));
    if (amount <= 0) throw new Error("cash ledger amount must be greater than 0");

    const rawEntryKind = normalizeText(input.entryKind, "manual").toLowerCase();
    const entryKind: DaaStoreCashLedgerEntryKind = rawEntryKind === "trade_execution" ? "trade_execution" : rawEntryKind === "dividend" ? "dividend" : "manual";
    const eventKind = entryKind === "trade_execution" ? "trade_execution" : entryKind === "dividend" ? "dividend" : "cash_transfer";
    const note = normalizeText(input.note, "");
    const entryId = randomUUID();

    await query("BEGIN");
    try {
      const accountState = await getAccountStateForUpdateInTx(query as any);
      const currentCash = Math.max(0, toFiniteNumber(accountState.cash, 0));
      const accountBaseCurrency = normalizeCcyCode(accountState.baseCurrency, "USD");
      const entryCurrency = normalizeCcyCode(input.baseCurrency, accountBaseCurrency);
      const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
      const fxMap = buildFxLookupMap(fxRes.rows as Array<Record<string, unknown>>);

      let fxRateToAccount = input.fxRateToAccount != null ? Math.max(0, toFiniteNumber(input.fxRateToAccount, 0)) : 0;
      if (!(fxRateToAccount > 0)) {
        fxRateToAccount = resolveFxRateToBase(accountBaseCurrency, entryCurrency, fxMap) ?? 0;
      }
      if (!(fxRateToAccount > 0) && entryCurrency === "USDC" && accountBaseCurrency === "USD") {
        fxRateToAccount = 1;
      }
      if (!(fxRateToAccount > 0)) {
        throw new Error(`missing fx rate for cash-ledger: ${entryCurrency}/${accountBaseCurrency}`);
      }

      const amountInAccountBase = input.amountInAccountBase != null && toFiniteNumber(input.amountInAccountBase, 0) > 0
        ? Math.max(0, toFiniteNumber(input.amountInAccountBase, 0))
        : amount * fxRateToAccount;
      const nextCash = side === "deposit" ? currentCash + amountInAccountBase : currentCash - amountInAccountBase;
      if (nextCash < -1e-9) {
        throw new Error(
          `insufficient cash for withdraw: ${amount.toFixed(2)} ${entryCurrency} (约 ${amountInAccountBase.toFixed(2)} ${accountBaseCurrency}) > ${currentCash.toFixed(2)} ${accountBaseCurrency}`,
        );
      }

      const normalizedNextCash = Math.max(0, nextCash);
      const valuation = await buildPortfolioSnapshotFromAssetUniverseInTx(query as DaaTxQueryFn, {
        baseCurrency: accountBaseCurrency,
        cash: normalizedNextCash,
      });
      const account = await syncStrategyAccountCashInTx(query as DaaTxQueryFn, normalizedNextCash, {
        totalEquity: valuation.totalEquity,
      });
      const ts = input.settlementTs ? toIsoString(input.settlementTs, new Date().toISOString()) : new Date().toISOString();
      const settlementTs = input.settlementTs ? toIsoString(input.settlementTs, ts) : null;
      await query(
        `INSERT INTO daa_portfolio_ledger_events (
           event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
           amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW()
         )`,
        [
          entryId,
          ts,
          eventKind,
          side,
          amount,
          entryCurrency,
          account.baseCurrency,
          amountInAccountBase,
          fxRateToAccount,
          input.ticketId ? normalizeText(input.ticketId) || null : null,
          input.cycleId ? normalizeText(input.cycleId) || null : null,
          settlementTs,
          note || null,
          JSON.stringify({ entryKind }),
        ],
      );

      await query(
        "INSERT INTO daa_equity_snapshots_v2 (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5)",
        [ts, valuation.totalEquity, valuation.holdingsValue, account.cash, "cash_ledger"],
      );

      const opLogMessage = side === "deposit"
        ? `资金入金 ${amount.toFixed(2)} ${entryCurrency}（折算 ${amountInAccountBase.toFixed(2)} ${account.baseCurrency}，余额 ${account.cash.toFixed(2)} ${account.baseCurrency}）`
        : `资金出金 ${amount.toFixed(2)} ${entryCurrency}（折算 ${amountInAccountBase.toFixed(2)} ${account.baseCurrency}，余额 ${account.cash.toFixed(2)} ${account.baseCurrency}）`;
      await query(
        "INSERT INTO daa_op_log (id, ts, level, message, context_json) VALUES ($1, NOW(), 'info', $2, $3)",
        [
          randomUUID(),
          opLogMessage,
          JSON.stringify({
            side,
            amount,
            baseCurrency: entryCurrency,
            entryKind,
            amountInAccountBase,
            accountBaseCurrency: account.baseCurrency,
            fxRateToAccount,
            ticketId: input.ticketId ? normalizeText(input.ticketId) || null : null,
            cycleId: input.cycleId ? normalizeText(input.cycleId) || null : null,
            note: note || null,
          }),
        ],
      );

      await query("COMMIT");

      const entryRes = await query(
        `SELECT event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
                amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, created_at
         FROM daa_portfolio_ledger_events
         WHERE event_id = $1
         LIMIT 1`,
        [entryId],
      );

      return {
        entry: mapCashLedgerRow(entryRes.rows[0] as Record<string, unknown>),
        account: {
          ...account,
          totalEquity: valuation.totalEquity,
        },
        equitySnapshot: {
          ts,
          totalEquity: valuation.totalEquity,
          holdingsValue: valuation.holdingsValue,
          cash: account.cash,
          source: "cash_ledger",
        },
      };
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("cashLedgerStore.rollback", err);
      }
      throw error;
    }
  });
}

