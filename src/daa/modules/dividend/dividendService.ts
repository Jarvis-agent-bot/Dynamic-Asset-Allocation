import { daaPgPool, withDaaPgClient } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────

type DaaDividendRecord = {
  id: string;
  symbol: string;
  market: string;
  exDate: string;          // ex-dividend date (YYYY-MM-DD)
  payDate: string | null;  // payment date
  amount: number;          // dividend per share in instrument currency
  currency: string;
  source: string;          // "yfinance" | "manual"
  createdAt: string;
};

type DaaDividendIncome = {
  id: string;
  symbol: string;
  market: string;
  exDate: string;
  holdingQty: number;      // shares held on ex-date
  amountPerShare: number;
  totalAmount: number;      // holdingQty × amountPerShare
  currency: string;
  amountInBase: number;     // converted to base currency
  fxRate: number;
  status: "pending" | "credited" | "reinvested" | "reversed";
  cashLedgerEntryId: string | null;
  createdAt: string;
};

type DividendSummary = {
  totalDividendsBase: number;
  pendingDividendsBase: number;
  creditedDividendsBase: number;
  reinvestedDividendsBase: number;
  lastDividendAt: string | null;
  bySymbol: { symbol: string; totalBase: number; count: number }[];
};

type DividendHistoryRow = {
  id: string;
  symbol: string;
  market: string;
  ex_date: string;
  pay_date: string | null;
  amount: number | string;
  currency: string;
  source: string;
  created_at: string;
};

type DividendIncomeRow = {
  id: string;
  symbol: string;
  market: string;
  ex_date: string;
  holding_qty: number | string;
  amount_per_share: number | string;
  total_amount: number | string;
  currency: string;
  amount_in_base: number | string;
  fx_rate: number | string;
  status: DaaDividendIncome["status"];
  cash_ledger_entry_id: string | null;
  created_at: string;
};

type DividendStatusSummaryRow = {
  status: DaaDividendIncome["status"];
  total: number | string | null;
  cnt: number | string;
};

type DividendBySymbolSummaryRow = {
  symbol: string;
  total: number | string | null;
  cnt: number | string;
};

type DividendLastDateRow = {
  last_date: string | null;
};

// ── Schema ─────────────────────────────────────────────────────────────

let schemaInitPromise: Promise<void> | null = null;

async function ensureDividendSchema(): Promise<void> {
  if (schemaInitPromise) return schemaInitPromise;
  schemaInitPromise = withDaaPgClient(async ({ query }) => {
    await query(`
      CREATE TABLE IF NOT EXISTS daa_dividend_history (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        market TEXT NOT NULL,
        ex_date TEXT NOT NULL,
        pay_date TEXT,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL DEFAULT 'USD',
        source TEXT NOT NULL DEFAULT 'yfinance',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (symbol, market, ex_date)
      );

      CREATE INDEX IF NOT EXISTS idx_daa_dividend_history_symbol
        ON daa_dividend_history(symbol, ex_date DESC);

      CREATE TABLE IF NOT EXISTS daa_dividend_income (
        id TEXT PRIMARY KEY,
        owner_account_id TEXT NOT NULL DEFAULT 'default',
        symbol TEXT NOT NULL,
        market TEXT NOT NULL,
        ex_date TEXT NOT NULL,
        holding_qty NUMERIC NOT NULL,
        amount_per_share NUMERIC NOT NULL,
        total_amount NUMERIC NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        amount_in_base NUMERIC NOT NULL DEFAULT 0,
        fx_rate NUMERIC NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'reinvested', 'reversed')),
        cash_ledger_entry_id TEXT,
        reversal_ledger_entry_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (owner_account_id, symbol, market, ex_date)
      );

      ALTER TABLE daa_dividend_income
        ADD COLUMN IF NOT EXISTS owner_account_id TEXT NOT NULL DEFAULT 'default';
      ALTER TABLE daa_dividend_income
        ADD COLUMN IF NOT EXISTS reversal_ledger_entry_id TEXT;
      ALTER TABLE daa_dividend_income
        DROP CONSTRAINT IF EXISTS daa_dividend_income_status_check;
      ALTER TABLE daa_dividend_income
        ADD CONSTRAINT daa_dividend_income_status_check
        CHECK (status IN ('pending', 'credited', 'reinvested', 'reversed'));
      ALTER TABLE daa_dividend_income
        DROP CONSTRAINT IF EXISTS daa_dividend_income_symbol_market_ex_date_key;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_dividend_income_owner_symbol_market_ex
        ON daa_dividend_income(owner_account_id, symbol, market, ex_date);
      CREATE INDEX IF NOT EXISTS idx_daa_dividend_income_owner_status
        ON daa_dividend_income(owner_account_id, status, created_at DESC);
    `);
  });
  return schemaInitPromise;
}

/**
 * 回放除息日开盘前已经完成的成交，得到实际享有该次分红的持仓数量。
 * 使用市场本地日界线，避免把除息日当天买入误算为有权分红。
 */
export async function getDividendHoldingQtyOnExDate(input: {
  symbol: string;
  market: string;
  exDate: string;
}): Promise<number> {
  const ownerAccountId = getDaaAccountScopeId();
  const pool = daaPgPool();
  const { rows } = await pool.query<{ holding_qty: number | string | null }>(
    `SELECT COALESCE(SUM(CASE WHEN side = 'BUY' THEN qty ELSE -qty END), 0) AS holding_qty
     FROM daa_trade_tickets
     WHERE owner_account_id = $1
       AND status = 'executed'
       AND UPPER(symbol) = UPPER($2)
       AND UPPER(market) = UPPER($3)
       AND executed_at < (
         $4::date::timestamp AT TIME ZONE CASE UPPER($3)
           WHEN 'HK' THEN 'Asia/Hong_Kong'
           WHEN 'KR' THEN 'Asia/Seoul'
           WHEN 'CN' THEN 'Asia/Shanghai'
           WHEN 'JP' THEN 'Asia/Tokyo'
           ELSE 'America/New_York'
         END
       )`,
    [ownerAccountId, input.symbol.toUpperCase(), input.market.toUpperCase(), input.exDate],
  );
  return Math.max(0, Number(rows[0]?.holding_qty) || 0);
}

// ── Dividend History CRUD ──────────────────────────────────────────────

export async function upsertDividendRecords(records: {
  symbol: string;
  market: string;
  exDate: string;
  payDate?: string | null;
  amount: number;
  currency: string;
  source?: string;
}[]): Promise<number> {
  await ensureDividendSchema();
  if (records.length === 0) return 0;

  const pool = daaPgPool();
  let count = 0;

  for (const rec of records) {
    if (!(rec.amount > 0)) continue;
    const id = randomUUID();
    const { rowCount } = await pool.query(
      `INSERT INTO daa_dividend_history (id, symbol, market, ex_date, pay_date, amount, currency, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (symbol, market, ex_date) DO UPDATE SET
         amount = EXCLUDED.amount,
         pay_date = COALESCE(EXCLUDED.pay_date, daa_dividend_history.pay_date),
         currency = EXCLUDED.currency`,
      [id, rec.symbol.toUpperCase(), rec.market.toUpperCase(), rec.exDate, rec.payDate || null, rec.amount, rec.currency, rec.source || "yfinance"],
    );
    count += rowCount ?? 0;
  }
  return count;
}

export async function listDividendHistory(input: {
  symbol?: string;
  limit?: number;
}): Promise<DaaDividendRecord[]> {
  await ensureDividendSchema();
  const pool = daaPgPool();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input.symbol) {
    params.push(input.symbol.toUpperCase());
    conditions.push(`symbol = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(500, input.limit || 100));

  const { rows } = await pool.query<DividendHistoryRow>(
    `SELECT id, symbol, market, ex_date, pay_date, amount, currency, source, created_at
     FROM daa_dividend_history
     ${where}
     ORDER BY ex_date DESC
     LIMIT ${limit}`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    market: row.market,
    exDate: row.ex_date,
    payDate: row.pay_date || null,
    amount: Number(row.amount),
    currency: row.currency,
    source: row.source,
    createdAt: row.created_at,
  }));
}

// ── Dividend Income Processing ─────────────────────────────────────────

/**
 * For a given ex-date's dividend record, check if the portfolio held the asset
 * and create a dividend income entry. Returns the created income or null.
 */
export async function processDividendIncome(input: {
  symbol: string;
  market: string;
  exDate: string;
  amountPerShare: number;
  currency: string;
  holdingQty: number;
  fxRate: number;
  baseCurrency: string;
}): Promise<DaaDividendIncome | null> {
  await ensureDividendSchema();
  if (!(input.holdingQty > 0) || !(input.amountPerShare > 0)) return null;

  const pool = daaPgPool();
  const ownerAccountId = getDaaAccountScopeId();
  const id = randomUUID();
  const totalAmount = input.holdingQty * input.amountPerShare;
  const fxRate = input.fxRate > 0 ? input.fxRate : 1;
  const amountInBase = totalAmount * fxRate;

  const { rows } = await pool.query<DividendIncomeRow>(
    `INSERT INTO daa_dividend_income
       (id, owner_account_id, symbol, market, ex_date, holding_qty, amount_per_share, total_amount, currency, amount_in_base, fx_rate, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
     ON CONFLICT (owner_account_id, symbol, market, ex_date) DO NOTHING
     RETURNING *`,
    [id, ownerAccountId, input.symbol.toUpperCase(), input.market.toUpperCase(), input.exDate,
     input.holdingQty, input.amountPerShare, totalAmount, input.currency, amountInBase, fxRate],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    symbol: row.symbol,
    market: row.market,
    exDate: row.ex_date,
    holdingQty: Number(row.holding_qty),
    amountPerShare: Number(row.amount_per_share),
    totalAmount: Number(row.total_amount),
    currency: row.currency,
    amountInBase: Number(row.amount_in_base),
    fxRate: Number(row.fx_rate),
    status: row.status,
    cashLedgerEntryId: row.cash_ledger_entry_id || null,
    createdAt: row.created_at,
  };
}

/**
 * Credit all pending dividend income entries to the cash ledger.
 * This should be called periodically (e.g., via cron).
 */
export async function creditPendingDividends(input: {
  appendCashLedger: (entry: {
    side: "deposit";
    amount: number;
    baseCurrency: string;
    entryKind: string;
    note: string;
  }) => Promise<{ id: string }>;
  baseCurrency: string;
}): Promise<{ credited: number; totalAmountBase: number }> {
  await ensureDividendSchema();
  const pool = daaPgPool();
  const ownerAccountId = getDaaAccountScopeId();

  const { rows } = await pool.query<DividendIncomeRow>(
    `SELECT * FROM daa_dividend_income
     WHERE owner_account_id = $1 AND status = 'pending'
     ORDER BY ex_date ASC`,
    [ownerAccountId],
  );

  let credited = 0;
  let totalAmountBase = 0;

  for (const row of rows) {
    const amountInBase = Number(row.amount_in_base);
    if (!(amountInBase > 0)) continue;

    try {
      const ledgerEntry = await input.appendCashLedger({
        side: "deposit",
        amount: amountInBase,
        baseCurrency: input.baseCurrency,
        entryKind: "dividend",
        note: `股息入账: ${row.symbol} ${row.ex_date} × ${Number(row.holding_qty).toFixed(2)}股 = ${amountInBase.toFixed(2)} ${input.baseCurrency}`,
      });

      await pool.query(
        `UPDATE daa_dividend_income
         SET status = 'credited', cash_ledger_entry_id = $1
         WHERE owner_account_id = $2 AND id = $3`,
        [ledgerEntry.id, ownerAccountId, row.id],
      );

      credited++;
      totalAmountBase += amountInBase;
    } catch (err) {
      logSwallowed("dividendService.processEntry", err);
    }
  }

  return { credited, totalAmountBase };
}

/**
 * Get a summary of all dividend income for the portfolio.
 */
export async function getDividendSummary(): Promise<DividendSummary> {
  await ensureDividendSchema();
  const pool = daaPgPool();
  const ownerAccountId = getDaaAccountScopeId();

  const { rows: statusRows } = await pool.query<DividendStatusSummaryRow>(
    `SELECT status, SUM(amount_in_base) as total, COUNT(*) as cnt
     FROM daa_dividend_income
     WHERE owner_account_id = $1 AND status <> 'reversed'
     GROUP BY status`,
    [ownerAccountId],
  );

  let totalDividendsBase = 0;
  let pendingDividendsBase = 0;
  let creditedDividendsBase = 0;
  let reinvestedDividendsBase = 0;

  for (const row of statusRows) {
    const amount = Number(row.total) || 0;
    totalDividendsBase += amount;
    if (row.status === "pending") pendingDividendsBase = amount;
    if (row.status === "credited") creditedDividendsBase = amount;
    if (row.status === "reinvested") reinvestedDividendsBase = amount;
  }

  const { rows: bySymbolRows } = await pool.query<DividendBySymbolSummaryRow>(
    `SELECT symbol, SUM(amount_in_base) as total, COUNT(*) as cnt
     FROM daa_dividend_income
     WHERE owner_account_id = $1 AND status <> 'reversed'
     GROUP BY symbol
     ORDER BY total DESC`,
    [ownerAccountId],
  );

  const { rows: lastRow } = await pool.query<DividendLastDateRow>(
    `SELECT MAX(ex_date) as last_date
     FROM daa_dividend_income
     WHERE owner_account_id = $1 AND status <> 'reversed'`,
    [ownerAccountId],
  );

  return {
    totalDividendsBase,
    pendingDividendsBase,
    creditedDividendsBase,
    reinvestedDividendsBase,
    lastDividendAt: lastRow[0]?.last_date || null,
    bySymbol: bySymbolRows.map((row) => ({
      symbol: row.symbol,
      totalBase: Number(row.total),
      count: Number(row.cnt),
    })),
  };
}
