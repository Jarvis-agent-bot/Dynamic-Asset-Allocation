type QueryFnV1 = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;

type MigrationV1 = {
  id: string;
  apply: (query: QueryFnV1) => Promise<void>;
};

function parseConfigJsonV1(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function normalizeBaseCurrencyV1(value: unknown, fallback = "USD"): string {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return fallback;
  if (text === "RMB" || text === "CNH") return "CNY";
  return text;
}

function toFiniteNumberV1(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureVersionTableV1(query: QueryFnV1): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS daa_schema_migrations_v1 (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureAccountStateSeedV1(query: QueryFnV1): Promise<void> {
  const existing = await query(
    "SELECT id FROM daa_account_state WHERE id = 'default' LIMIT 1",
  );
  if (existing.rows.length > 0) return;

  const configRes = await query(
    "SELECT config_json FROM daa_system_config_v2 WHERE id = 'default' ORDER BY version DESC, updated_at DESC LIMIT 1",
  );
  const config = parseConfigJsonV1(configRes.rows[0]?.config_json);
  const strategy = config?.strategy && typeof config.strategy === "object" ? config.strategy : {};
  const account = strategy?.account && typeof strategy.account === "object" ? strategy.account : {};

  const baseCurrency = normalizeBaseCurrencyV1(account.baseCurrency, "USD");
  const cash = Math.max(0, toFiniteNumberV1(account.cash, 0));
  const frozenCash = Math.max(0, toFiniteNumberV1(account.frozenCash, 0));
  const rawInvestable = toFiniteNumberV1(account.investableCash, Number.NaN);
  const investableCash = Number.isFinite(rawInvestable)
    ? Math.max(0, Math.min(cash, rawInvestable))
    : Math.max(0, cash - frozenCash);
  const totalEquityRaw = account.totalEquity == null ? Number.NaN : toFiniteNumberV1(account.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null;

  await query(
    `INSERT INTO daa_account_state (
       id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at
     ) VALUES (
       'default', $1, $2, $3, $4, $5, NOW()
     )`,
    [baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
}

const MIGRATIONS_V1: MigrationV1[] = [
  {
    id: "20260309_account_state",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_account_state (
          id TEXT PRIMARY KEY,
          base_currency TEXT NOT NULL DEFAULT 'USD',
          cash NUMERIC NOT NULL DEFAULT 0,
          investable_cash NUMERIC NOT NULL DEFAULT 0,
          frozen_cash NUMERIC NOT NULL DEFAULT 0,
          total_equity NUMERIC,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ensureAccountStateSeedV1(query);
    },
  },
  {
    id: "20260309_asset_domain_foundation",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_asset_master (
          asset_key TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL DEFAULT 'US',
          currency TEXT NOT NULL DEFAULT 'USD',
          asset_class TEXT NOT NULL DEFAULT 'EQUITY',
          region TEXT NOT NULL DEFAULT 'GLOBAL',
          exchange TEXT NOT NULL DEFAULT '',
          instrument_type TEXT NOT NULL DEFAULT 'STOCK',
          market_group TEXT NOT NULL DEFAULT 'GLOBAL_EQUITY',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_portfolio_positions (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          holding_qty NUMERIC NOT NULL DEFAULT 0,
          holding_price NUMERIC NOT NULL DEFAULT 0,
          cost_basis NUMERIC,
          holding_tags TEXT[] NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_watchlist_entries (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          watch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          watch_tags TEXT[] NOT NULL DEFAULT '{}',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_target_allocations (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          target_weight_hint NUMERIC NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_market_price_snapshots (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          last_price NUMERIC NOT NULL DEFAULT 0,
          price_updated_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        INSERT INTO daa_asset_master (
          asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at
        )
        SELECT asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET symbol = EXCLUDED.symbol,
            market = EXCLUDED.market,
            currency = EXCLUDED.currency,
            asset_class = EXCLUDED.asset_class,
            region = EXCLUDED.region,
            exchange = EXCLUDED.exchange,
            instrument_type = EXCLUDED.instrument_type,
            market_group = EXCLUDED.market_group,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_portfolio_positions (
          asset_key, holding_qty, holding_price, cost_basis, holding_tags, updated_at
        )
        SELECT asset_key, holding_qty, holding_price, cost_basis, holding_tags, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET holding_qty = EXCLUDED.holding_qty,
            holding_price = EXCLUDED.holding_price,
            cost_basis = EXCLUDED.cost_basis,
            holding_tags = EXCLUDED.holding_tags,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_watchlist_entries (
          asset_key, watch_enabled, watch_tags, notes, created_at, updated_at
        )
        SELECT asset_key, watch_enabled, watch_tags, notes, created_at, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET watch_enabled = EXCLUDED.watch_enabled,
            watch_tags = EXCLUDED.watch_tags,
            notes = EXCLUDED.notes,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_target_allocations (
          asset_key, target_weight_hint, updated_at
        )
        SELECT asset_key, target_weight_hint, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET target_weight_hint = EXCLUDED.target_weight_hint,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_market_price_snapshots (
          asset_key, last_price, price_updated_at, updated_at
        )
        SELECT asset_key, last_price, price_updated_at, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET last_price = EXCLUDED.last_price,
            price_updated_at = EXCLUDED.price_updated_at,
            updated_at = EXCLUDED.updated_at
      `);
    },
  },
  {
    id: "20260309_strategy_lab_run_snapshots",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_strategy_lab_run_snapshots (
          run_id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          base_currency TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          summary_json JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_strategy_lab_run_snapshots_created_desc ON daa_strategy_lab_run_snapshots(created_at DESC)");
    },
  },
  {
    id: "20260309_job_execution_logs",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_job_execution_logs (
          job_id TEXT PRIMARY KEY,
          job_type TEXT NOT NULL,
          request_id TEXT,
          trigger_source TEXT NOT NULL,
          idempotency_key TEXT,
          status TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ,
          duration_ms BIGINT,
          result_json JSONB,
          error_text TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_job_execution_logs_type_started_desc ON daa_job_execution_logs(job_type, started_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_job_execution_logs_request_id ON daa_job_execution_logs(request_id)");
    },
  },
];

export async function runDaaStoreRuntimeMigrationsV1(query: QueryFnV1): Promise<void> {
  await ensureVersionTableV1(query);
  for (const migration of MIGRATIONS_V1) {
    const existing = await query(
      "SELECT id FROM daa_schema_migrations_v1 WHERE id = $1 LIMIT 1",
      [migration.id],
    );
    if (existing.rows.length > 0) continue;
    await migration.apply(query);
    await query(
      "INSERT INTO daa_schema_migrations_v1 (id, applied_at) VALUES ($1, NOW()) ON CONFLICT (id) DO NOTHING",
      [migration.id],
    );
  }
}
