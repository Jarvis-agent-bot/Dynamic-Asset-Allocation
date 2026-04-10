import { randomUUID } from "node:crypto";

import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { toFinite } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;

type Migration = {
  id: string;
  apply: (query: QueryFn) => Promise<void>;
};

function parseConfigJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch (err) {
      logSwallowed("runtimeMigrations.parseConfigJson", err);
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function normalizeBaseCurrency(value: unknown, fallback = "USD"): string {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return fallback;
  if (text === "RMB" || text === "CNH") return "CNY";
  return text;
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value).toISOString() : "";
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

async function tableExists(query: QueryFn, tableName: string): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1",
    [tableName],
  );
  return result.rows.length > 0;
}

async function ensureVersionTable(query: QueryFn): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS daa_schema_migrations_v1 (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureAccountStateSeed(query: QueryFn): Promise<void> {
  const existing = await query(
    "SELECT id FROM daa_account_state_v2 WHERE id = 'default' LIMIT 1",
  );
  if (existing.rows.length > 0) return;

  const configRes = await query(
    "SELECT config_json FROM daa_system_config_v2 WHERE id = 'default' ORDER BY version DESC, updated_at DESC LIMIT 1",
  );
  const config = parseConfigJson(configRes.rows[0]?.config_json);
  const strategy = config?.strategy && typeof config.strategy === "object" ? config.strategy : {};
  const account = strategy?.account && typeof strategy.account === "object" ? strategy.account : {};

  const baseCurrency = normalizeBaseCurrency(account.baseCurrency, "USD");
  const cash = Math.max(0, toFinite(account.cash, 0));
  const frozenCash = Math.max(0, toFinite(account.frozenCash, 0));
  const investableCash = resolveInvestableCash({
    cash,
    frozenCash,
    investableCash: account.investableCash,
  });
  const totalEquityRaw = account.totalEquity == null ? Number.NaN : toFinite(account.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null;

  await query(
    `INSERT INTO daa_account_state_v2 (
       id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at
     ) VALUES (
       'default', $1, $2, $3, $4, $5, NOW()
     )`,
    [baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
}

const MIGRATIONS_: Migration[] = [
  {
    id: "20260309_account_state",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_account_state_v2 (
          id TEXT PRIMARY KEY,
          base_currency TEXT NOT NULL DEFAULT 'USD',
          cash NUMERIC NOT NULL DEFAULT 0,
          investable_cash NUMERIC NOT NULL DEFAULT 0,
          frozen_cash NUMERIC NOT NULL DEFAULT 0,
          total_equity NUMERIC,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ensureAccountStateSeed(query);
    },
  },
  {
    id: "20260309_asset_domain_foundation",
    async apply(query) {
      // 创建规范化表（CREATE TABLE IF NOT EXISTS 保证幂等）
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
      // 历史数据种子（从旧 daa_asset_universe 同步，仅在该表存在时执行）
      if (!(await tableExists(query, "daa_asset_universe"))) return;

      await query(`
        INSERT INTO daa_asset_master (asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at)
        SELECT asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at
        FROM daa_asset_universe ON CONFLICT (asset_key) DO NOTHING
      `);
      await query(`
        INSERT INTO daa_watchlist_entries (asset_key, watch_enabled, watch_tags, notes, created_at, updated_at)
        SELECT asset_key, watch_enabled, watch_tags, notes, created_at, updated_at
        FROM daa_asset_universe ON CONFLICT (asset_key) DO NOTHING
      `);
      await query(`
        INSERT INTO daa_target_allocations (asset_key, target_weight_hint, updated_at)
        SELECT asset_key, target_weight_hint, updated_at
        FROM daa_asset_universe ON CONFLICT (asset_key) DO NOTHING
      `);
      await query(`
        INSERT INTO daa_market_price_snapshots (asset_key, last_price, price_updated_at, updated_at)
        SELECT asset_key, last_price, price_updated_at, updated_at
        FROM daa_asset_universe ON CONFLICT (asset_key) DO NOTHING
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
  {
    id: "20260319_notification_delivery_logs",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_notification_delivery_logs (
          id TEXT PRIMARY KEY,
          channel TEXT NOT NULL,
          event_type TEXT NOT NULL,
          trigger_source TEXT NOT NULL DEFAULT 'unknown',
          success BOOLEAN NOT NULL DEFAULT FALSE,
          status_code INTEGER,
          error_code TEXT,
          error_message TEXT,
          recipient_hint TEXT,
          job_id TEXT,
          cycle_id TEXT,
          ticket_id TEXT,
          request_json JSONB,
          response_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_notification_delivery_logs_created_desc ON daa_notification_delivery_logs(created_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_notification_delivery_logs_channel_created_desc ON daa_notification_delivery_logs(channel, created_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_notification_delivery_logs_job_id ON daa_notification_delivery_logs(job_id)");
    },
  },
  {
    id: "20260319_current_ledger_opening_balance",
    async apply(query) {
      const hasLedgerTable = await tableExists(query, "daa_portfolio_ledger_events");
      if (!hasLedgerTable) return;

      const ledgerStartRes = await query(
        "SELECT MAX(ts) AS ledger_start_ts FROM daa_portfolio_ledger_events WHERE event_kind = 'ledger_reset'",
      );
      const ledgerStartTs = toIsoTimestamp(ledgerStartRes.rows[0]?.ledger_start_ts);
      if (!ledgerStartTs) return;

      const [openingExistsRes, snapshotRes, accountRes, activityRes, holdingRes] = await Promise.all([
        query(
          "SELECT 1 FROM daa_portfolio_ledger_events WHERE event_kind = 'opening_balance' AND ts >= $1 LIMIT 1",
          [ledgerStartTs],
        ),
        query(
          "SELECT cash FROM daa_equity_snapshots_v2 WHERE ts = $1 AND source = 'ledger_reset' ORDER BY ts DESC LIMIT 1",
          [ledgerStartTs],
        ),
        query(
          "SELECT base_currency, cash, frozen_cash, investable_cash FROM daa_account_state_v2 WHERE id = 'default' LIMIT 1",
        ),
        query(
          "SELECT COUNT(*) AS count FROM daa_portfolio_ledger_events WHERE event_kind <> 'ledger_reset' AND ts >= $1",
          [ledgerStartTs],
        ),
        query(
          "SELECT COUNT(*) AS count FROM daa_asset_universe WHERE holding_qty > 0 OR holding_price > 0 OR cost_basis IS NOT NULL",
        ),
      ]);

      const accountRow = accountRes.rows[0] || {};
      const baseCurrency = normalizeBaseCurrency(accountRow.base_currency, "USD");
      const snapshotCash = Math.max(0, toFinite(snapshotRes.rows[0]?.cash, Number.NaN));
      const currentCash = Math.max(0, toFinite(accountRow.cash, 0));
      const frozenCash = Math.max(0, toFinite(accountRow.frozen_cash, 0));
      const investableCash = resolveInvestableCash({
        cash: currentCash,
        frozenCash,
        investableCash: accountRow.investable_cash,
      });
      const openingCash = Number.isFinite(snapshotCash) ? snapshotCash : currentCash;
      const hasOpeningBalance = openingExistsRes.rows.length > 0;
      const activityCount = Math.max(0, toFinite(activityRes.rows[0]?.count, 0));
      const holdingCount = Math.max(0, toFinite(holdingRes.rows[0]?.count, 0));

      if (!hasOpeningBalance && openingCash > 0) {
        await query(
          `INSERT INTO daa_portfolio_ledger_events (
             event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
             amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
           ) VALUES (
             $1,$2,'opening_balance','deposit',$3,$4,$4,$3,1,NULL,NULL,$2,$5,$6::jsonb,NOW()
           )`,
          [
            randomUUID(),
            ledgerStartTs,
            openingCash,
            baseCurrency,
            "当前工作账本期初余额",
            JSON.stringify({ entryKind: "opening_balance", reason: "runtime_backfill" }),
          ],
        );
      }

      if (holdingCount === 0 && activityCount === 0) {
        await query(
          `UPDATE daa_account_state_v2
           SET cash = $1,
               investable_cash = $2,
               frozen_cash = $3,
               total_equity = $1,
               updated_at = NOW()
           WHERE id = 'default'`,
          [openingCash, Math.min(openingCash, investableCash), frozenCash],
        );
      }
    },
  },
  {
    id: "20260319_broker_connector_foundation",
    async apply(query) {
      await query("ALTER TABLE daa_trade_tickets DROP CONSTRAINT IF EXISTS daa_trade_tickets_status_check");
      await query(
        "ALTER TABLE daa_trade_tickets ADD CONSTRAINT daa_trade_tickets_status_check CHECK (status IN ('ready', 'submitted', 'partially_filled', 'executed', 'canceled', 'rejected'))",
      ).catch((err: unknown) => {
        // 仅忽略约束已存在的错误（PG error code 42710）
        const code = (err as Record<string, unknown>)?.code;
        if (code !== "42710") throw err;
      });
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_kind TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_account_id TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_order_id TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_status TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS filled_qty NUMERIC");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS avg_fill_price NUMERIC");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS last_broker_sync_at TIMESTAMPTZ");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS last_applied_fill_qty NUMERIC NOT NULL DEFAULT 0");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_reject_reason TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_raw_json JSONB");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_broker_order_id ON daa_trade_tickets(broker_order_id)");

      await query(`
        CREATE TABLE IF NOT EXISTS daa_broker_order_snapshots (
          ticket_id TEXT PRIMARY KEY REFERENCES daa_trade_tickets(ticket_id) ON DELETE CASCADE,
          broker_kind TEXT NOT NULL,
          broker_account_id TEXT,
          broker_order_id TEXT NOT NULL,
          status TEXT NOT NULL,
          filled_qty NUMERIC,
          avg_fill_price NUMERIC,
          raw_json JSONB,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_broker_order_snapshots_order_unique ON daa_broker_order_snapshots(broker_kind, broker_order_id)");
    },
  },
  {
    id: "20260326_price_history_ohlcv",
    async apply(query) {
      const hasPriceHistory = await tableExists(query, "daa_price_history");
      if (!hasPriceHistory) return;
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS open_price NUMERIC");
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS high_price NUMERIC");
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS low_price NUMERIC");
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS volume BIGINT");
    },
  },
  {
    id: "20260327_macro_cycle_snapshots",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_macro_cycle_snapshots (
          id TEXT PRIMARY KEY,
          phase TEXT NOT NULL,
          growth_proxy NUMERIC NOT NULL,
          inflation_proxy NUMERIC NOT NULL,
          confidence NUMERIC NOT NULL,
          label TEXT NOT NULL,
          favored_assets TEXT[] NOT NULL DEFAULT '{}',
          data_source TEXT NOT NULL DEFAULT 'proxy',
          fred_gdp_pct NUMERIC,
          fred_cpi_pct NUMERIC,
          fred_unemployment_pct NUMERIC,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_macro_cycle_snapshots_created_desc ON daa_macro_cycle_snapshots(created_at DESC)");
    },
  },
  {
    id: "20260320_broker_portfolio_snapshots",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_broker_account_state (
          broker_kind TEXT PRIMARY KEY,
          account_id TEXT,
          base_currency TEXT NOT NULL DEFAULT 'USD',
          cash NUMERIC NOT NULL DEFAULT 0,
          investable_cash NUMERIC NOT NULL DEFAULT 0,
          frozen_cash NUMERIC NOT NULL DEFAULT 0,
          total_equity NUMERIC,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS daa_broker_positions (
          broker_kind TEXT NOT NULL,
          account_id TEXT,
          asset_key TEXT NOT NULL,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL DEFAULT 'US',
          currency TEXT NOT NULL DEFAULT 'USD',
          qty NUMERIC NOT NULL DEFAULT 0,
          price NUMERIC NOT NULL DEFAULT 0,
          cost_basis NUMERIC,
          tags TEXT[] NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (broker_kind, asset_key)
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_broker_positions_kind_updated_desc ON daa_broker_positions(broker_kind, updated_at DESC)");
    },
  },
  {
    id: "20260327_today_decision_log",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_decision_log (
          id SERIAL PRIMARY KEY,
          account_id TEXT NOT NULL DEFAULT 'default',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          asset_key TEXT NOT NULL,
          conclusion TEXT NOT NULL,
          user_action TEXT NOT NULL,
          llm_reason TEXT,
          signal_snapshot JSONB,
          outcome_checked_at TIMESTAMPTZ,
          outcome_result JSONB
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_decision_log_account_created_desc ON daa_decision_log(account_id, created_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_decision_log_asset_key ON daa_decision_log(asset_key)");
    },
  },
  {
    id: "20260327_today_cache",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_today_cache (
          id SERIAL PRIMARY KEY,
          account_id TEXT NOT NULL DEFAULT 'default',
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          decision_context JSONB NOT NULL,
          llm_output JSONB NOT NULL,
          is_stale BOOLEAN NOT NULL DEFAULT false
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_today_cache_account_cached_desc ON daa_today_cache(account_id, cached_at DESC)");
    },
  },
  {
    id: "20260331_watchlist_price_alerts",
    async apply(query) {
      await query("ALTER TABLE daa_asset_universe ADD COLUMN IF NOT EXISTS price_alert_above NUMERIC");
      await query("ALTER TABLE daa_asset_universe ADD COLUMN IF NOT EXISTS price_alert_below NUMERIC");
    },
  },
  {
    id: "20260406_cost_basis_in_base",
    async apply(query) {
      // 新增基准货币的成本列
      await query("ALTER TABLE daa_positions_v2 ADD COLUMN IF NOT EXISTS cost_basis_in_base NUMERIC");
      await query("ALTER TABLE daa_asset_universe ADD COLUMN IF NOT EXISTS cost_basis_in_base NUMERIC");

      // 回填：用当前 FX 汇率 × costBasis（最佳近似值）
      // USD 标的直接 1:1，非 USD 标的查 FX 表
      await query(`
        UPDATE daa_positions_v2 p
        SET cost_basis_in_base = CASE
          WHEN UPPER(p.currency) = 'USD' THEN p.cost_basis
          ELSE p.cost_basis * COALESCE(
            (SELECT f.rate FROM daa_fx_rates f
             WHERE UPPER(f.base_ccy) = UPPER(p.currency) AND UPPER(f.quote_ccy) = 'USD'
             LIMIT 1),
            (SELECT 1.0 / NULLIF(f.rate, 0) FROM daa_fx_rates f
             WHERE UPPER(f.base_ccy) = 'USD' AND UPPER(f.quote_ccy) = UPPER(p.currency)
             LIMIT 1)
          )
        END
        WHERE p.cost_basis IS NOT NULL AND p.cost_basis > 0
          AND (p.cost_basis_in_base IS NULL OR p.cost_basis_in_base = 0)
      `);

      // 同步到 asset_universe
      await query(`
        UPDATE daa_asset_universe u
        SET cost_basis_in_base = p.cost_basis_in_base
        FROM daa_positions_v2 p
        WHERE p.asset_key = u.asset_key
          AND p.cost_basis_in_base IS NOT NULL
          AND (u.cost_basis_in_base IS NULL OR u.cost_basis_in_base = 0)
      `);
    },
  },
  {
    id: "20260408_news_llm_analysis",
    async apply(query) {
      // 新闻信号表新增 LLM 分析字段
      await query("ALTER TABLE daa_news_signal_snapshot_v1 ADD COLUMN IF NOT EXISTS llm_summary TEXT");
      await query("ALTER TABLE daa_news_signal_snapshot_v1 ADD COLUMN IF NOT EXISTS llm_drivers_json JSONB");
      await query("ALTER TABLE daa_news_signal_snapshot_v1 ADD COLUMN IF NOT EXISTS llm_major_event_json JSONB");
      await query("ALTER TABLE daa_news_signal_snapshot_v1 ADD COLUMN IF NOT EXISTS llm_action_hint TEXT");
      await query("ALTER TABLE daa_news_signal_snapshot_v1 ADD COLUMN IF NOT EXISTS item_hash_set TEXT");
    },
  },
  {
    id: "20260408_notif_dedup_major_event_idx",
    async apply(query) {
      // 重大新闻推送去重查询的 partial index
      await query(`
        CREATE INDEX IF NOT EXISTS idx_daa_notif_dedup_major_event
        ON daa_notification_delivery_logs (event_type, success, created_at DESC)
        WHERE event_type = 'news_major_event' AND success = TRUE
      `);
    },
  },

  // ── Cognitive Agent OS ──

  {
    id: "20260409_pgvector_extension",
    async apply(query) {
      await query(`CREATE EXTENSION IF NOT EXISTS vector`);
    },
  },
  {
    id: "20260409_cognitive_agent_tables",
    async apply(query) {
      // 研究线索：Agent 的认知单元
      await query(`
        CREATE TABLE IF NOT EXISTS daa_research_threads (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          thesis_text TEXT NOT NULL,
          conviction TEXT NOT NULL DEFAULT 'medium',
          invalidation_conditions TEXT,
          review_at TIMESTAMPTZ,
          asset_keys TEXT[] DEFAULT '{}',
          tags TEXT[] DEFAULT '{}',
          priority_score NUMERIC DEFAULT 0.5,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // 证据链：支撑或反驳 thesis 的每条证据
      await query(`
        CREATE TABLE IF NOT EXISTS daa_evidence_items (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL REFERENCES daa_research_threads(id) ON DELETE CASCADE,
          evidence_type TEXT NOT NULL,
          source TEXT NOT NULL,
          content TEXT NOT NULL,
          data_snapshot JSONB,
          confidence NUMERIC DEFAULT 0.5,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_evidence_thread ON daa_evidence_items(thread_id, created_at DESC)`);

      // Agent 运行记录
      await query(`
        CREATE TABLE IF NOT EXISTS daa_agent_runs (
          id TEXT PRIMARY KEY,
          trigger TEXT NOT NULL,
          langgraph_thread_id TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          target_thread_ids TEXT[],
          graph_state JSONB,
          tools_called JSONB DEFAULT '[]',
          reasoning_traces JSONB DEFAULT '[]',
          surprises JSONB DEFAULT '[]',
          briefing JSONB,
          total_tokens INT DEFAULT 0,
          total_cost_usd NUMERIC DEFAULT 0,
          duration_ms INT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON daa_agent_runs(created_at DESC)`);

      // Agent 长期记忆（pgvector 语义检索）
      await query(`
        CREATE TABLE IF NOT EXISTS daa_agent_memory (
          id TEXT PRIMARY KEY,
          memory_type TEXT NOT NULL,
          content TEXT NOT NULL,
          source_run_ids TEXT[] DEFAULT '{}',
          relevance_tags TEXT[] DEFAULT '{}',
          embedding vector(384),
          strength NUMERIC DEFAULT 1.0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_accessed TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // 决策复盘
      await query(`
        CREATE TABLE IF NOT EXISTS daa_thesis_reviews (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL REFERENCES daa_research_threads(id) ON DELETE CASCADE,
          review_window TEXT NOT NULL,
          thesis_at_time TEXT NOT NULL,
          conviction_at_time TEXT NOT NULL,
          actual_outcome TEXT,
          accuracy_score NUMERIC,
          lessons_learned TEXT,
          generated_memory_ids TEXT[] DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_thesis_reviews_thread ON daa_thesis_reviews(thread_id, created_at DESC)`);
    },
  },
  {
    id: "20260409_migrate_learning_to_memory",
    async apply(query) {
      // 将旧 agent_learning_events 中的 outcome_verdict 数据迁移到 agent_memory
      // 仅在旧表存在且新表为空时执行
      const oldTableExists = await query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'daa_agent_learning_events'
        ) AS exists
      `);
      if (!oldTableExists.rows[0]?.exists) return;

      const newCount = await query(`SELECT COUNT(*) AS cnt FROM daa_agent_memory`);
      if (Number(newCount.rows[0]?.cnt ?? 0) > 0) return; // 已有数据，跳过

      // 迁移学习事件为 "lesson" 类型的记忆
      await query(`
        INSERT INTO daa_agent_memory (id, memory_type, content, source_run_ids, relevance_tags, strength, created_at, last_accessed)
        SELECT
          gen_random_uuid()::text,
          'lesson',
          COALESCE(title, '') || ': ' || COALESCE(summary, ''),
          ARRAY[]::text[],
          CASE
            WHEN symbol IS NOT NULL THEN ARRAY[symbol]
            ELSE ARRAY[]::text[]
          END,
          1.0,
          created_at,
          created_at
        FROM daa_agent_learning_events
        WHERE event_type = 'outcome_verdict'
        ORDER BY created_at DESC
        LIMIT 50
      `);
    },
  },

  // ── 规范化表迁移：停止双写 daa_asset_universe ──

  {
    id: "20260409_normalize_watchlist_price_alerts",
    async apply(query) {
      await query("ALTER TABLE daa_watchlist_entries ADD COLUMN IF NOT EXISTS price_alert_above NUMERIC");
      await query("ALTER TABLE daa_watchlist_entries ADD COLUMN IF NOT EXISTS price_alert_below NUMERIC");
      // 历史回填：仅在旧表存在时从 daa_asset_universe 同步
      if (!(await tableExists(query, "daa_asset_universe"))) return;
      await query(`
        UPDATE daa_watchlist_entries we
        SET price_alert_above = u.price_alert_above, price_alert_below = u.price_alert_below
        FROM daa_asset_universe u
        WHERE u.asset_key = we.asset_key AND (u.price_alert_above IS NOT NULL OR u.price_alert_below IS NOT NULL)
      `);
    },
  },
  {
    id: "20260410_rename_llm_decision_snapshot_key",
    async apply(query) {
      // 重命名 JSONB 中嵌入的 __llmDecisionSnapshot → __agentDecisionSnapshot
      // rebalance_cycles 表的 market_context_json 字段
      const hasCycles = await tableExists(query, "daa_rebalance_cycles");
      if (!hasCycles) return;

      await query(`
        UPDATE daa_rebalance_cycles
        SET market_context_json = (
          market_context_json - '__llmDecisionSnapshot'
          || jsonb_build_object('__agentDecisionSnapshot', market_context_json->'__llmDecisionSnapshot')
        )
        WHERE market_context_json ? '__llmDecisionSnapshot'
      `);
    },
  },
];

export async function runDaaStoreRuntimeMigrations(query: QueryFn): Promise<void> {
  await ensureVersionTable(query);
  for (const migration of MIGRATIONS_) {
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
